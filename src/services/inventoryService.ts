import { collection, doc, runTransaction, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { InventoryItem, InventoryMovement, ReferenceType, InventoryMovementType } from '../types';

const INVENTORY_ITEMS_COLLECTION = 'inventory_items';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';

// توسيع محلي لـ InventoryMovement لدعم sourceLineId إن وجد
interface InventoryMovementWithLine extends Omit<InventoryMovement, 'id'> {
  sourceLineId?: string;
}

export interface StockItemInput {
  productId: string;
  quantity: number;
  unitCost: number; // تكلفة الشراء أو التكلفة التاريخية
  lineId?: string;  // معرف فريد للسطر داخل المستند لضمان Idempotency دقيقة
}

export interface StockOperationParams {
  warehouseId: string;
  referenceType: ReferenceType;
  referenceId: string; 
  type: InventoryMovementType;
  items: StockItemInput[];
  description?: string;
  createdBy: string;
}

export interface TransferItemInput {
  productId: string;
  quantity: number;
  lineId?: string;
}

export interface TransferOperationParams {
  sourceWarehouseId: string;
  destWarehouseId: string;
  transferId: string;
  items: TransferItemInput[];
  description?: string;
  createdBy: string;
}

// دالة مساعدة للتحقق من سلامة الأرقام المالية والكميات
const validateNumber = (val: number, fieldName: string, allowZero = false) => {
  if (!Number.isFinite(val) || Number.isNaN(val)) {
    throw new Error(`قيمة غير صالحة لـ ${fieldName}: يجب أن تكون رقماً معرفاً (Finite)`);
  }
  if (allowZero ? val < 0 : val <= 0) {
    throw new Error(`قيمة غير صالحة لـ ${fieldName}: يجب أن تكون أكبر من الصفر`);
  }
};

// 1. دخول بضاعة (Stock In) - [شراء، مرتجع بيع، تسوية بالزيادة، رصيد افتتاحي]
export const processStockIn = async (params: StockOperationParams): Promise<void> => {
  if (!params.items || params.items.length === 0) throw new Error('لا توجد أصناف لتسجيلها');

  for (const item of params.items) {
    validateNumber(item.quantity, 'الكمية');
    validateNumber(item.unitCost, 'تكلفة الوحدة', true);
  }

  await runTransaction(db, async (transaction) => {
    const now = Timestamp.now();
    const uniqueProductIds = Array.from(new Set(params.items.map(i => i.productId)));

    // --- مرحلة 1: القراءات (Reads) ---
    const movementSnaps = new Map<string, any>();
    for (let i = 0; i < params.items.length; i++) {
      const lineIdentifier = params.items[i].lineId || `idx_${i}`;
      const movementId = `${params.referenceId}_${lineIdentifier}_in`;
      movementSnaps.set(lineIdentifier, await transaction.get(doc(db, INVENTORY_MOVEMENTS_COLLECTION, movementId)));
    }

    const itemSnaps = new Map<string, any>();
    for (const productId of uniqueProductIds) {
      const inventoryItemId = `${params.warehouseId}_${productId}`;
      itemSnaps.set(productId, await transaction.get(doc(db, INVENTORY_ITEMS_COLLECTION, inventoryItemId)));
    }

    // --- مرحلة 2: الحسابات التراكمية في الذاكرة (In-Memory Running State) ---
    const runningState = new Map<string, { qty: number; wac: number }>();
    for (const productId of uniqueProductIds) {
      const snap = itemSnaps.get(productId);
      if (snap && snap.exists()) {
        const data = snap.data() as InventoryItem;
        runningState.set(productId, {
          qty: Number.isFinite(data.quantity) ? data.quantity : 0,
          wac: Number.isFinite(data.wac) ? data.wac : 0,
        });
      } else {
        runningState.set(productId, { qty: 0, wac: 0 });
      }
    }

    const movementsToWrite: Array<{ ref: any; data: InventoryMovementWithLine }> = [];
    const itemsToWrite = new Map<string, { ref: any; data: InventoryItem }>();

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const lineIdentifier = item.lineId || `idx_${i}`;
      
      if (movementSnaps.get(lineIdentifier)?.exists()) continue; // تخطي السطر لو نُفذ مسبقاً (Idempotency)

      const currentState = runningState.get(item.productId)!;
      const newQty = currentState.qty + item.quantity;
      let newWac = 0;

      const totalOldValue = currentState.qty * currentState.wac;
      const totalNewValue = item.quantity * item.unitCost;
      
      if (newQty > 0) {
        newWac = (totalOldValue + totalNewValue) / newQty;
      }
      
      if (!Number.isFinite(newWac) || newWac < 0) {
        throw new Error(`خلل محاسبي: نتج متوسط تكلفة غير صالح للصنف ${item.productId}`);
      }
      newWac = Number(newWac.toFixed(4));

      // تحديث الحالة التراكمية في الذاكرة للسطر القادم
      runningState.set(item.productId, { qty: newQty, wac: newWac });

      const movementId = `${params.referenceId}_${lineIdentifier}_in`;
      movementsToWrite.push({
        ref: doc(db, INVENTORY_MOVEMENTS_COLLECTION, movementId),
        data: {
          productId: item.productId,
          warehouseId: params.warehouseId,
          type: params.type,
          flow: 'in',
          quantityIn: item.quantity,
          quantityOut: 0,
          balanceAfter: newQty,
          unitCost: item.unitCost,
          averageCostAfter: newWac,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          sourceLineId: lineIdentifier,
          description: params.description || '',
          createdBy: params.createdBy,
          createdAt: now as unknown as Date,
          updatedAt: now as unknown as Date,
        }
      });

      const inventoryItemId = `${params.warehouseId}_${item.productId}`;
      itemsToWrite.set(item.productId, {
        ref: doc(db, INVENTORY_ITEMS_COLLECTION, inventoryItemId),
        data: {
          id: inventoryItemId,
          productId: item.productId,
          warehouseId: params.warehouseId,
          quantity: newQty,
          wac: newWac,
          inventoryValue: Number((newQty * newWac).toFixed(4)),
          lastUpdatedAt: now as unknown as Date,
        }
      });
    }

    // --- مرحلة 3: الكتابات النهائية (Writes) ---
    for (const mov of movementsToWrite) {
      transaction.set(mov.ref, mov.data);
    }
    // تحديث كل منتج مرة واحدة فقط برصيده النهائي التراكمي
    itemsToWrite.forEach((itemOps) => {
      transaction.set(itemOps.ref, itemOps.data, { merge: true });
    });
  });
};

// 2. خروج بضاعة (Stock Out) - [بيع، مرتجع شراء، هالك، تسوية بالنقص]
export const processStockOut = async (params: StockOperationParams): Promise<void> => {
  if (!params.items || params.items.length === 0) throw new Error('لا توجد أصناف لتسجيلها');

  for (const item of params.items) {
    validateNumber(item.quantity, 'الكمية');
    if (params.type === 'purchase_return') {
      validateNumber(item.unitCost, 'تكلفة الوحدة التاريخية للمرتجع', true);
    }
  }

  await runTransaction(db, async (transaction) => {
    const now = Timestamp.now();
    const uniqueProductIds = Array.from(new Set(params.items.map(i => i.productId)));

    // --- مرحلة 1: القراءات (Reads) ---
    const movementSnaps = new Map<string, any>();
    for (let i = 0; i < params.items.length; i++) {
      const lineIdentifier = params.items[i].lineId || `idx_${i}`;
      const movementId = `${params.referenceId}_${lineIdentifier}_out`;
      movementSnaps.set(lineIdentifier, await transaction.get(doc(db, INVENTORY_MOVEMENTS_COLLECTION, movementId)));
    }

    const itemSnaps = new Map<string, any>();
    for (const productId of uniqueProductIds) {
      const inventoryItemId = `${params.warehouseId}_${productId}`;
      itemSnaps.set(productId, await transaction.get(doc(db, INVENTORY_ITEMS_COLLECTION, inventoryItemId)));
    }

    // --- مرحلة 2: الحسابات التراكمية (In-Memory Running State) ---
    const runningState = new Map<string, { qty: number; wac: number }>();
    for (const productId of uniqueProductIds) {
      const snap = itemSnaps.get(productId);
      if (!snap || !snap.exists()) {
        throw new Error(`الصنف غير موجود بالمخزن ولا يمكن سحبه (${productId})`);
      }
      const data = snap.data() as InventoryItem;
      runningState.set(productId, {
        qty: Number.isFinite(data.quantity) ? data.quantity : 0,
        wac: Number.isFinite(data.wac) ? data.wac : 0,
      });
    }

    const movementsToWrite: Array<{ ref: any; data: InventoryMovementWithLine }> = [];
    const itemsToWrite = new Map<string, { ref: any; data: Partial<InventoryItem> }>();

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const lineIdentifier = item.lineId || `idx_${i}`;
      
      if (movementSnaps.get(lineIdentifier)?.exists()) continue;

      const currentState = runningState.get(item.productId)!;

      // منع الرصيد السالب التراكمي (يتحقق خطوة بخطوة مع كل سطر)
      if (currentState.qty < item.quantity) {
        throw new Error(`رصيد الصنف غير كافٍ. المتاح: ${currentState.qty}, المطلوب للسطر: ${item.quantity} (${item.productId})`);
      }

      const newQty = currentState.qty - item.quantity;
      let newWac = currentState.wac;
      let movementHistoricalCost = currentState.wac;

      if (params.type === 'purchase_return') {
        movementHistoricalCost = item.unitCost;
        if (newQty === 0) {
          newWac = 0;
        } else {
          const totalOldValue = currentState.qty * currentState.wac;
          const returnedValue = item.quantity * movementHistoricalCost;
          newWac = (totalOldValue - returnedValue) / newQty;

          if (!Number.isFinite(newWac) || newWac < 0) {
            throw new Error('خلل محاسبي: نتج متوسط تكلفة سالب. راجع تكلفة المرتجع التاريخية.');
          }
        }
      } else {
        newWac = currentState.wac;
      }

      newWac = Number(newWac.toFixed(4));
      
      // تحديث الحالة التراكمية
      runningState.set(item.productId, { qty: newQty, wac: newWac });

      const movementId = `${params.referenceId}_${lineIdentifier}_out`;
      movementsToWrite.push({
        ref: doc(db, INVENTORY_MOVEMENTS_COLLECTION, movementId),
        data: {
          productId: item.productId,
          warehouseId: params.warehouseId,
          type: params.type,
          flow: 'out',
          quantityIn: 0,
          quantityOut: item.quantity,
          balanceAfter: newQty,
          unitCost: movementHistoricalCost,
          averageCostAfter: newWac,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          sourceLineId: lineIdentifier,
          description: params.description || '',
          createdBy: params.createdBy,
          createdAt: now as unknown as Date,
          updatedAt: now as unknown as Date,
        }
      });

      const inventoryItemId = `${params.warehouseId}_${item.productId}`;
      itemsToWrite.set(item.productId, {
        ref: doc(db, INVENTORY_ITEMS_COLLECTION, inventoryItemId),
        data: {
          quantity: newQty,
          wac: newWac,
          inventoryValue: Number((newQty * newWac).toFixed(4)),
          lastUpdatedAt: now as unknown as Date,
        }
      });
    }

    // --- مرحلة 3: الكتابات النهائية (Writes) ---
    for (const mov of movementsToWrite) {
      transaction.set(mov.ref, mov.data);
    }
    itemsToWrite.forEach((itemOps) => {
      transaction.update(itemOps.ref, itemOps.data);
    });
  });
};

// 3. التحويل المخزني (Atomic Warehouse Transfer)
export const processWarehouseTransfer = async (params: TransferOperationParams): Promise<void> => {
  if (params.sourceWarehouseId === params.destWarehouseId) {
    throw new Error('لا يمكن التحويل لنفس المخزن');
  }
  if (!params.items || params.items.length === 0) throw new Error('لا توجد أصناف للتحويل');

  for (const item of params.items) validateNumber(item.quantity, 'كمية التحويل');

  await runTransaction(db, async (transaction) => {
    const now = Timestamp.now();
    const uniqueProductIds = Array.from(new Set(params.items.map(i => i.productId)));

    // --- مرحلة 1: القراءات (Reads) ---
    const movementOutSnaps = new Map<string, any>();
    const movementInSnaps = new Map<string, any>();
    
    for (let i = 0; i < params.items.length; i++) {
      const lineIdentifier = params.items[i].lineId || `idx_${i}`;
      const transferOutId = `${params.transferId}_${lineIdentifier}_out`;
      const transferInId = `${params.transferId}_${lineIdentifier}_in`;
      
      movementOutSnaps.set(lineIdentifier, await transaction.get(doc(db, INVENTORY_MOVEMENTS_COLLECTION, transferOutId)));
      movementInSnaps.set(lineIdentifier, await transaction.get(doc(db, INVENTORY_MOVEMENTS_COLLECTION, transferInId)));
    }

    const sourceItemSnaps = new Map<string, any>();
    const destItemSnaps = new Map<string, any>();

    for (const productId of uniqueProductIds) {
      const sourceItemId = `${params.sourceWarehouseId}_${productId}`;
      const destItemId = `${params.destWarehouseId}_${productId}`;
      sourceItemSnaps.set(productId, await transaction.get(doc(db, INVENTORY_ITEMS_COLLECTION, sourceItemId)));
      destItemSnaps.set(productId, await transaction.get(doc(db, INVENTORY_ITEMS_COLLECTION, destItemId)));
    }

    // --- مرحلة 2: الحسابات التراكمية (In-Memory Running State) ---
    const sourceRunningState = new Map<string, { qty: number; wac: number }>();
    const destRunningState = new Map<string, { qty: number; wac: number }>();

    for (const productId of uniqueProductIds) {
      const sSnap = sourceItemSnaps.get(productId);
      if (!sSnap || !sSnap.exists()) throw new Error(`الصنف غير موجود في المخزن المصدر (${productId})`);
      const sData = sSnap.data() as InventoryItem;
      sourceRunningState.set(productId, {
        qty: Number.isFinite(sData.quantity) ? sData.quantity : 0,
        wac: Number.isFinite(sData.wac) ? sData.wac : 0,
      });

      const dSnap = destItemSnaps.get(productId);
      if (dSnap && dSnap.exists()) {
        const dData = dSnap.data() as InventoryItem;
        destRunningState.set(productId, {
          qty: Number.isFinite(dData.quantity) ? dData.quantity : 0,
          wac: Number.isFinite(dData.wac) ? dData.wac : 0,
        });
      } else {
        destRunningState.set(productId, { qty: 0, wac: 0 });
      }
    }

    const movementsToWrite: Array<{ ref: any; data: InventoryMovementWithLine }> = [];
    const sourceItemsToWrite = new Map<string, { ref: any; data: Partial<InventoryItem> }>();
    const destItemsToWrite = new Map<string, { ref: any; data: InventoryItem }>();

    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const lineIdentifier = item.lineId || `idx_${i}`;
      
      const outExists = movementOutSnaps.get(lineIdentifier)?.exists();
      const inExists = movementInSnaps.get(lineIdentifier)?.exists();
      if (outExists && inExists) continue; // Idempotency المزدوج

      // معالجة المصدر (Out)
      const currentSourceState = sourceRunningState.get(item.productId)!;
      if (currentSourceState.qty < item.quantity) {
        throw new Error(`رصيد المخزن المصدر غير كافٍ للصنف. المتاح: ${currentSourceState.qty}`);
      }

      const newSourceQty = currentSourceState.qty - item.quantity;
      const transferCost = currentSourceState.wac; // WAC المصدر الحالي ينتقل للمستقبل
      
      sourceRunningState.set(item.productId, { qty: newSourceQty, wac: transferCost });

      // معالجة المستقبل (In)
      const currentDestState = destRunningState.get(item.productId)!;
      const newDestQty = currentDestState.qty + item.quantity;
      let newDestWac = 0;
      
      const totalOldDestValue = currentDestState.qty * currentDestState.wac;
      const transferredValue = item.quantity * transferCost;
      
      if (newDestQty > 0) {
        newDestWac = (totalOldDestValue + transferredValue) / newDestQty;
      }
      
      if (!Number.isFinite(newDestWac) || newDestWac < 0) throw new Error('خلل محاسبي أثناء حساب تكلفة التحويل');
      newDestWac = Number(newDestWac.toFixed(4));

      destRunningState.set(item.productId, { qty: newDestQty, wac: newDestWac });

      // تحضير الـ Writes
      const transferOutId = `${params.transferId}_${lineIdentifier}_out`;
      const transferInId = `${params.transferId}_${lineIdentifier}_in`;

      movementsToWrite.push({
        ref: doc(db, INVENTORY_MOVEMENTS_COLLECTION, transferOutId),
        data: {
          productId: item.productId,
          warehouseId: params.sourceWarehouseId,
          type: 'transfer_out',
          flow: 'out',
          quantityIn: 0,
          quantityOut: item.quantity,
          balanceAfter: newSourceQty,
          unitCost: transferCost,
          averageCostAfter: transferCost,
          referenceType: 'transfer',
          referenceId: params.transferId,
          transferId: params.transferId,
          sourceLineId: lineIdentifier,
          description: params.description || 'تحويل صادر',
          createdBy: params.createdBy,
          createdAt: now as unknown as Date,
          updatedAt: now as unknown as Date,
        }
      });

      movementsToWrite.push({
        ref: doc(db, INVENTORY_MOVEMENTS_COLLECTION, transferInId),
        data: {
          productId: item.productId,
          warehouseId: params.destWarehouseId,
          type: 'transfer_in',
          flow: 'in',
          quantityIn: item.quantity,
          quantityOut: 0,
          balanceAfter: newDestQty,
          unitCost: transferCost,
          averageCostAfter: newDestWac,
          referenceType: 'transfer',
          referenceId: params.transferId,
          transferId: params.transferId,
          sourceLineId: lineIdentifier,
          description: params.description || 'تحويل وارد',
          createdBy: params.createdBy,
          createdAt: now as unknown as Date,
          updatedAt: now as unknown as Date,
        }
      });

      sourceItemsToWrite.set(item.productId, {
        ref: doc(db, INVENTORY_ITEMS_COLLECTION, `${params.sourceWarehouseId}_${item.productId}`),
        data: {
          quantity: newSourceQty,
          inventoryValue: Number((newSourceQty * transferCost).toFixed(4)),
          lastUpdatedAt: now as unknown as Date,
        }
      });

      const destItemId = `${params.destWarehouseId}_${item.productId}`;
      destItemsToWrite.set(item.productId, {
        ref: doc(db, INVENTORY_ITEMS_COLLECTION, destItemId),
        data: {
          id: destItemId,
          productId: item.productId,
          warehouseId: params.destWarehouseId,
          quantity: newDestQty,
          wac: newDestWac,
          inventoryValue: Number((newDestQty * newDestWac).toFixed(4)),
          lastUpdatedAt: now as unknown as Date,
        }
      });
    }

    // --- مرحلة 3: الكتابات النهائية (Writes) ---
    for (const mov of movementsToWrite) transaction.set(mov.ref, mov.data);
    sourceItemsToWrite.forEach(op => transaction.update(op.ref, op.data));
    destItemsToWrite.forEach(op => transaction.set(op.ref, op.data, { merge: true }));
  });
};

// 4. جلب أرصدة الأصناف داخل مخزن محدد
export const getWarehouseStock = async (warehouseId: string): Promise<InventoryItem[]> => {
  const q = query(
    collection(db, INVENTORY_ITEMS_COLLECTION),
    where('warehouseId', '==', warehouseId),
    where('quantity', '>', 0)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      lastUpdatedAt: data.lastUpdatedAt?.toDate() || new Date(),
    } as InventoryItem;
  });
};

// 5. جلب كشف حساب مخزني (Ledger) لصنف داخل مخزن
export const getItemLedger = async (warehouseId: string, productId: string): Promise<InventoryMovement[]> => {
  const q = query(
    collection(db, INVENTORY_MOVEMENTS_COLLECTION),
    where('warehouseId', '==', warehouseId),
    where('productId', '==', productId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as InventoryMovement;
  });
};
