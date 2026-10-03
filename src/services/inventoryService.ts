import { 
  doc, 
  collection, 
  runTransaction, 
  Timestamp, 
  Transaction as FirestoreTransaction,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  InventoryItem, 
  InventoryMovement, 
  InventoryMovementType, 
  InventoryReferenceType 
} from '../types';

const INVENTORY_COLLECTION = 'inventory_items';
const MOVEMENTS_COLLECTION = 'inventory_movements';

// ==========================================
// 1. Backward Compatibility Interfaces (Old API)
// ==========================================

export interface StockItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
  sourceLineId?: string;
}

export interface StockOperationParams {
  warehouseId: string;
  items: StockItemInput[];
  referenceType: InventoryReferenceType;
  referenceId: string;
  description?: string;
  createdBy: string;
}

export interface TransferItemInput {
  productId: string;
  quantity: number;
  sourceLineId?: string;
}

export interface TransferOperationParams {
  sourceWarehouseId: string;
  destWarehouseId: string;
  items: TransferItemInput[];
  transferId?: string;
  description?: string;
  createdBy: string;
}

// ==========================================
// 2. New Atomic Single-Item Interfaces
// ==========================================

export interface ProcessStockInParams {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  sourceLineId?: string;
  description?: string;
  createdBy: string;
}

export interface ProcessStockOutParams {
  productId: string;
  warehouseId: string;
  quantity: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  sourceLineId?: string;
  description?: string;
  createdBy: string;
}

export interface ProcessWarehouseTransferParams {
  productId: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  quantity: number;
  transferId: string;
  sourceLineId?: string;
  description?: string;
  createdBy: string;
}

export interface PreparedStockIn {
  isIdempotent: boolean;
  movementRef: any;
  movementData?: Omit<InventoryMovement, 'id'>;
  itemRef: any;
  itemData?: Omit<InventoryItem, 'id'> | Partial<InventoryItem>;
  isNewItem?: boolean;
}

export interface PreparedStockOut {
  isIdempotent: boolean;
  movementRef: any;
  movementData?: Omit<InventoryMovement, 'id'>;
  itemRef: any;
  itemUpdateData?: Partial<InventoryItem>;
}

export interface PreparedWarehouseTransfer {
  isIdempotent: boolean;
  outMovementRef: any;
  outMovementData?: Omit<InventoryMovement, 'id'>;
  inMovementRef: any;
  inMovementData?: Omit<InventoryMovement, 'id'>;
  sourceItemRef: any;
  sourceItemUpdateData?: Partial<InventoryItem>;
  destItemRef: any;
  destItemData?: Omit<InventoryItem, 'id'> | Partial<InventoryItem>;
  isNewDestItem?: boolean;
}

// ==========================================
// 3. Validation Helpers
// ==========================================

const validateQuantity = (qty: number) => {
  if (!Number.isFinite(qty) || Number.isNaN(qty) || qty <= 0) {
    throw new Error('الكمية يجب أن تكون رقماً صحيحاً وموجباً.');
  }
};

const generateMovementId = (refType: string, refId: string, type: string, lineId?: string) => {
  return `mov_${refType}_${refId}_${lineId || 'main'}_${type}`;
};

// ==========================================
// 4. Stock In (Read/Prepare Phase)
// ==========================================

export const prepareStockInInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessStockInParams
): Promise<PreparedStockIn> => {
  if (!params.productId || !params.warehouseId) throw new Error("معرف المنتج والمخزن مطلوبان.");
  validateQuantity(params.quantity);
  if (params.unitCost < 0) throw new Error("التكلفة لا يمكن أن تكون سالبة.");

  const generatedMovementId = generateMovementId(params.referenceType, params.referenceId, 'in', params.sourceLineId);
  
  const movementRef = doc(db, MOVEMENTS_COLLECTION, generatedMovementId);
  const itemRef = doc(db, INVENTORY_COLLECTION, `${params.warehouseId}_${params.productId}`);

  // Sequential Reads
  const movementSnap = await transaction.get(movementRef);
  const itemSnap = await transaction.get(itemRef);

  // Idempotency Check
  if (movementSnap.exists()) {
    const existingMove = movementSnap.data() as InventoryMovement;
    if (
      existingMove.productId === params.productId &&
      existingMove.warehouseId === params.warehouseId &&
      existingMove.quantityIn === params.quantity &&
      existingMove.referenceType === params.referenceType &&
      existingMove.referenceId === params.referenceId &&
      existingMove.sourceLineId === params.sourceLineId
    ) {
      return { isIdempotent: true, movementRef, itemRef };
    } else {
      throw new Error(`معرف الحركة مستخدم بالفعل لمعاملة إدخال مخزني أخرى بتفاصيل مختلفة (${generatedMovementId})`);
    }
  }

  const now = Timestamp.now();
  let oldQuantity = 0;
  let oldWac = 0;
  const isNewItem = !itemSnap.exists();

  if (!isNewItem) {
    const currentItem = itemSnap.data() as InventoryItem;
    oldQuantity = Number.isFinite(currentItem.quantity) ? currentItem.quantity : 0;
    oldWac = Number.isFinite(currentItem.wac) ? currentItem.wac : 0;
  }

  const newQuantity = Number((oldQuantity + params.quantity).toFixed(4));
  
  // WAC Calculation
  let newWac = params.unitCost;
  if (newQuantity > 0) {
    const totalOldValue = oldQuantity * oldWac;
    const totalNewValue = params.quantity * params.unitCost;
    newWac = Number(((totalOldValue + totalNewValue) / newQuantity).toFixed(4));
  }
  
  const newInventoryValue = Number((newQuantity * newWac).toFixed(4));

  const movementData: Omit<InventoryMovement, 'id'> = {
    productId: params.productId,
    warehouseId: params.warehouseId,
    type: params.referenceType === 'purchase_return' ? 'purchase_return' : (params.referenceType === 'transfer' ? 'transfer_in' : 'stock_in'),
    flow: 'in',
    quantityIn: params.quantity,
    quantityOut: 0,
    balanceAfter: newQuantity,
    unitCost: params.unitCost,
    averageCostAfter: newWac,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    sourceLineId: params.sourceLineId,
    description: params.description || '',
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  const itemData = isNewItem 
    ? {
        productId: params.productId,
        warehouseId: params.warehouseId,
        quantity: newQuantity,
        wac: newWac,
        inventoryValue: newInventoryValue,
        lastUpdatedAt: now as unknown as Date
      } 
    : {
        quantity: newQuantity,
        wac: newWac,
        inventoryValue: newInventoryValue,
        lastUpdatedAt: now as unknown as Date
      };

  return {
    isIdempotent: false,
    movementRef,
    movementData,
    itemRef,
    itemData,
    isNewItem
  };
};

// ==========================================
// 5. Stock In (Write/Commit Phase)
// ==========================================

export const commitStockInInTransaction = (
  transaction: FirestoreTransaction,
  prepared: PreparedStockIn
): void => {
  if (prepared.isIdempotent) return;

  if (prepared.movementData && prepared.itemData) {
    transaction.set(prepared.movementRef, prepared.movementData);
    
    if (prepared.isNewItem) {
      transaction.set(prepared.itemRef, prepared.itemData);
    } else {
      transaction.update(prepared.itemRef, prepared.itemData);
    }
  }
};

// ==========================================
// 6. Stock Out (Read/Prepare Phase)
// ==========================================

export const prepareStockOutInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessStockOutParams
): Promise<PreparedStockOut> => {
  if (!params.productId || !params.warehouseId) throw new Error("معرف المنتج والمخزن مطلوبان.");
  validateQuantity(params.quantity);

  const generatedMovementId = generateMovementId(params.referenceType, params.referenceId, 'out', params.sourceLineId);
  
  const movementRef = doc(db, MOVEMENTS_COLLECTION, generatedMovementId);
  const itemRef = doc(db, INVENTORY_COLLECTION, `${params.warehouseId}_${params.productId}`);

  // Sequential Reads
  const movementSnap = await transaction.get(movementRef);
  const itemSnap = await transaction.get(itemRef);

  // Idempotency Check
  if (movementSnap.exists()) {
    const existingMove = movementSnap.data() as InventoryMovement;
    if (
      existingMove.productId === params.productId &&
      existingMove.warehouseId === params.warehouseId &&
      existingMove.quantityOut === params.quantity &&
      existingMove.referenceType === params.referenceType &&
      existingMove.referenceId === params.referenceId &&
      existingMove.sourceLineId === params.sourceLineId
    ) {
      return { isIdempotent: true, movementRef, itemRef };
    } else {
      throw new Error(`معرف الحركة مستخدم بالفعل لمعاملة إخراج مخزني أخرى بتفاصيل مختلفة (${generatedMovementId})`);
    }
  }

  if (!itemSnap.exists()) {
    throw new Error(`المنتج غير موجود في هذا المخزن للسحب منه. (${params.productId})`);
  }

  const currentItem = itemSnap.data() as InventoryItem;
  const currentQuantity = Number.isFinite(currentItem.quantity) ? currentItem.quantity : 0;
  const currentWac = Number.isFinite(currentItem.wac) ? currentItem.wac : 0;

  if (currentQuantity < params.quantity) {
    throw new Error(`الرصيد المتاح لا يكفي. المتاح: ${currentQuantity}, المطلوب: ${params.quantity}`);
  }

  const newQuantity = Number((currentQuantity - params.quantity).toFixed(4));
  const newInventoryValue = Number((newQuantity * currentWac).toFixed(4));
  const now = Timestamp.now();

  const movementData: Omit<InventoryMovement, 'id'> = {
    productId: params.productId,
    warehouseId: params.warehouseId,
    type: params.referenceType === 'transfer' ? 'transfer_out' : 'stock_out',
    flow: 'out',
    quantityIn: 0,
    quantityOut: params.quantity,
    balanceAfter: newQuantity,
    unitCost: currentWac, // السحب يتم بمتوسط التكلفة الحالي ولا يغيره
    averageCostAfter: currentWac,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    sourceLineId: params.sourceLineId,
    description: params.description || '',
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  const itemUpdateData = {
    quantity: newQuantity,
    inventoryValue: newInventoryValue,
    lastUpdatedAt: now as unknown as Date
  };

  return {
    isIdempotent: false,
    movementRef,
    movementData,
    itemRef,
    itemUpdateData
  };
};

// ==========================================
// 7. Stock Out (Write/Commit Phase)
// ==========================================

export const commitStockOutInTransaction = (
  transaction: FirestoreTransaction,
  prepared: PreparedStockOut
): void => {
  if (prepared.isIdempotent) return;

  if (prepared.movementData && prepared.itemUpdateData) {
    transaction.set(prepared.movementRef, prepared.movementData);
    transaction.update(prepared.itemRef, prepared.itemUpdateData);
  }
};

// ==========================================
// 8. Warehouse Transfer (Read/Prepare Phase)
// ==========================================

export const prepareWarehouseTransferInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessWarehouseTransferParams
): Promise<PreparedWarehouseTransfer> => {
  if (!params.productId || !params.sourceWarehouseId || !params.destWarehouseId) {
    throw new Error("بيانات النقل (المنتج، المخزن المصدر، المخزن المستلم) غير مكتملة.");
  }
  if (params.sourceWarehouseId === params.destWarehouseId) {
    throw new Error("لا يمكن النقل لنفس المخزن.");
  }
  validateQuantity(params.quantity);

  const outMovementRef = doc(db, MOVEMENTS_COLLECTION, `mov_transfer_${params.transferId}_${params.sourceLineId || params.productId}_out`);
  const inMovementRef = doc(db, MOVEMENTS_COLLECTION, `mov_transfer_${params.transferId}_${params.sourceLineId || params.productId}_in`);
  
  const sourceItemRef = doc(db, INVENTORY_COLLECTION, `${params.sourceWarehouseId}_${params.productId}`);
  const destItemRef = doc(db, INVENTORY_COLLECTION, `${params.destWarehouseId}_${params.productId}`);

  // Sequential Reads
  const outMovementSnap = await transaction.get(outMovementRef);
  const inMovementSnap = await transaction.get(inMovementRef);
  const sourceItemSnap = await transaction.get(sourceItemRef);
  const destItemSnap = await transaction.get(destItemRef);

  const outExists = outMovementSnap.exists();
  const inExists = inMovementSnap.exists();

  // Strict & Deep Idempotency Check
  if (outExists && inExists) {
    const outMove = outMovementSnap.data() as InventoryMovement;
    const inMove = inMovementSnap.data() as InventoryMovement;

    const isOutMatch = 
      outMove.referenceId === params.transferId &&
      outMove.productId === params.productId &&
      outMove.warehouseId === params.sourceWarehouseId &&
      outMove.sourceLineId === params.sourceLineId &&
      outMove.quantityOut === params.quantity &&
      outMove.type === 'transfer_out';

    const isInMatch = 
      inMove.referenceId === params.transferId &&
      inMove.productId === params.productId &&
      inMove.warehouseId === params.destWarehouseId &&
      inMove.sourceLineId === params.sourceLineId &&
      inMove.quantityIn === params.quantity &&
      inMove.type === 'transfer_in';

    if (isOutMatch && isInMatch) {
      return { 
        isIdempotent: true, 
        outMovementRef, 
        inMovementRef, 
        sourceItemRef, 
        destItemRef 
      };
    } else {
      throw new Error(`رقم التحويل (${params.transferId}) مستخدم لعملية نقل أخرى بتفاصيل مختلفة.`);
    }
  }

  if (outExists !== inExists) {
    throw new Error("حالة النقل المخزني غير متسقة. يرجى مراجعة الدعم.");
  }

  if (!sourceItemSnap.exists()) {
    throw new Error(`المنتج غير موجود في المخزن المصدر للسحب منه.`);
  }

  const sourceItem = sourceItemSnap.data() as InventoryItem;
  const sourceQuantity = Number.isFinite(sourceItem.quantity) ? sourceItem.quantity : 0;
  
  // تكلفة الوحدة المنقولة إلى المخزن المستلم هي WAC الحالي للمخزن المصدر، 
  // ثم يتم استخدام هذه التكلفة لحساب WAC الجديد في المخزن المستلم.
  const sourceWac = Number.isFinite(sourceItem.wac) ? sourceItem.wac : 0; 

  if (sourceQuantity < params.quantity) {
    throw new Error(`رصيد المخزن المصدر لا يكفي. المتاح: ${sourceQuantity}, المطلوب: ${params.quantity}`);
  }

  const now = Timestamp.now();
  const newSourceQuantity = Number((sourceQuantity - params.quantity).toFixed(4));
  const newSourceInventoryValue = Number((newSourceQuantity * sourceWac).toFixed(4));

  // Dest item calculations
  const isNewDestItem = !destItemSnap.exists();
  let destQuantity = 0;
  let destWac = 0;

  if (!isNewDestItem) {
    const destItem = destItemSnap.data() as InventoryItem;
    destQuantity = Number.isFinite(destItem.quantity) ? destItem.quantity : 0;
    destWac = Number.isFinite(destItem.wac) ? destItem.wac : 0;
  }

  const newDestQuantity = Number((destQuantity + params.quantity).toFixed(4));
  
  // Dest WAC Calculation
  let newDestWac = sourceWac;
  if (newDestQuantity > 0) {
    const totalOldValue = destQuantity * destWac;
    const totalNewValue = params.quantity * sourceWac;
    newDestWac = Number(((totalOldValue + totalNewValue) / newDestQuantity).toFixed(4));
  }

  const newDestInventoryValue = Number((newDestQuantity * newDestWac).toFixed(4));

  const outMovementData: Omit<InventoryMovement, 'id'> = {
    productId: params.productId,
    warehouseId: params.sourceWarehouseId,
    type: 'transfer_out',
    flow: 'out',
    quantityIn: 0,
    quantityOut: params.quantity,
    balanceAfter: newSourceQuantity,
    unitCost: sourceWac,
    averageCostAfter: sourceWac,
    referenceType: 'transfer',
    referenceId: params.transferId,
    transferId: params.transferId,
    sourceLineId: params.sourceLineId,
    description: params.description || `تحويل صادر إلى مخزن ${params.destWarehouseId}`,
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  const inMovementData: Omit<InventoryMovement, 'id'> = {
    productId: params.productId,
    warehouseId: params.destWarehouseId,
    type: 'transfer_in',
    flow: 'in',
    quantityIn: params.quantity,
    quantityOut: 0,
    balanceAfter: newDestQuantity,
    unitCost: sourceWac,
    averageCostAfter: newDestWac,
    referenceType: 'transfer',
    referenceId: params.transferId,
    transferId: params.transferId,
    sourceLineId: params.sourceLineId,
    description: params.description || `تحويل وارد من مخزن ${params.sourceWarehouseId}`,
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  const sourceItemUpdateData = {
    quantity: newSourceQuantity,
    inventoryValue: newSourceInventoryValue,
    lastUpdatedAt: now as unknown as Date
  };

  const destItemData = isNewDestItem 
    ? {
        productId: params.productId,
        warehouseId: params.destWarehouseId,
        quantity: newDestQuantity,
        wac: newDestWac,
        inventoryValue: newDestInventoryValue,
        lastUpdatedAt: now as unknown as Date
      }
    : {
        quantity: newDestQuantity,
        wac: newDestWac,
        inventoryValue: newDestInventoryValue,
        lastUpdatedAt: now as unknown as Date
      };

  return {
    isIdempotent: false,
    outMovementRef,
    outMovementData,
    inMovementRef,
    inMovementData,
    sourceItemRef,
    sourceItemUpdateData,
    destItemRef,
    destItemData,
    isNewDestItem
  };
};

// ==========================================
// 9. Warehouse Transfer (Write/Commit Phase)
// ==========================================

export const commitWarehouseTransferInTransaction = (
  transaction: FirestoreTransaction,
  prepared: PreparedWarehouseTransfer
): void => {
  if (prepared.isIdempotent) return;

  if (prepared.outMovementData && prepared.inMovementData && prepared.sourceItemUpdateData && prepared.destItemData) {
    transaction.set(prepared.outMovementRef, prepared.outMovementData);
    transaction.set(prepared.inMovementRef, prepared.inMovementData);
    
    transaction.update(prepared.sourceItemRef, prepared.sourceItemUpdateData);
    
    if (prepared.isNewDestItem) {
      transaction.set(prepared.destItemRef, prepared.destItemData);
    } else {
      transaction.update(prepared.destItemRef, prepared.destItemData);
    }
  }
};

// ==========================================
// 10. Backward Compatibility Orchestrators (Supports Both APIs)
// ==========================================

export const processStockInInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessStockInParams | StockOperationParams
): Promise<void> => {
  if ('items' in params) {
    // Array API (Phase 1 & 2): Collect all reads first, then write all.
    const prepares: PreparedStockIn[] = [];
    for (const item of params.items) {
      prepares.push(await prepareStockInInTransaction(transaction, {
        productId: item.productId,
        warehouseId: params.warehouseId,
        quantity: item.quantity,
        unitCost: item.unitCost || 0,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        sourceLineId: item.sourceLineId,
        description: params.description,
        createdBy: params.createdBy
      }));
    }
    for (const prepared of prepares) {
      commitStockInInTransaction(transaction, prepared);
    }
  } else {
    // Single Item API (Phase 3)
    const prepared = await prepareStockInInTransaction(transaction, params);
    commitStockInInTransaction(transaction, prepared);
  }
};

export const processStockOutInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessStockOutParams | StockOperationParams
): Promise<void> => {
  if ('items' in params) {
    const prepares: PreparedStockOut[] = [];
    for (const item of params.items) {
      prepares.push(await prepareStockOutInTransaction(transaction, {
        productId: item.productId,
        warehouseId: params.warehouseId,
        quantity: item.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        sourceLineId: item.sourceLineId,
        description: params.description,
        createdBy: params.createdBy
      }));
    }
    for (const prepared of prepares) {
      commitStockOutInTransaction(transaction, prepared);
    }
  } else {
    const prepared = await prepareStockOutInTransaction(transaction, params);
    commitStockOutInTransaction(transaction, prepared);
  }
};

export const processWarehouseTransferInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessWarehouseTransferParams | TransferOperationParams
): Promise<void> => {
  if ('items' in params) {
    const prepares: PreparedWarehouseTransfer[] = [];
    const transferId = params.transferId || doc(collection(db, MOVEMENTS_COLLECTION)).id;
    for (const item of params.items) {
      prepares.push(await prepareWarehouseTransferInTransaction(transaction, {
        productId: item.productId,
        sourceWarehouseId: params.sourceWarehouseId,
        destWarehouseId: params.destWarehouseId,
        quantity: item.quantity,
        transferId: transferId,
        sourceLineId: item.sourceLineId,
        description: params.description,
        createdBy: params.createdBy
      }));
    }
    for (const prepared of prepares) {
      commitWarehouseTransferInTransaction(transaction, prepared);
    }
  } else {
    const prepared = await prepareWarehouseTransferInTransaction(transaction, params);
    commitWarehouseTransferInTransaction(transaction, prepared);
  }
};

// ==========================================
// 11. Public Wrappers (For UI & Stores)
// ==========================================

export const processStockIn = async (params: StockOperationParams): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    await processStockInInTransaction(transaction, params);
  });
};

export const processStockOut = async (params: StockOperationParams): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    await processStockOutInTransaction(transaction, params);
  });
};

export const processWarehouseTransfer = async (params: TransferOperationParams): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    await processWarehouseTransferInTransaction(transaction, params);
  });
};

// ==========================================
// 12. Read-Only Public Functions
// ==========================================

export const getWarehouseStock = async (warehouseId: string): Promise<InventoryItem[]> => {
  const q = query(
    collection(db, INVENTORY_COLLECTION), 
    where('warehouseId', '==', warehouseId)
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

export const getItemLedger = async (warehouseId: string, productId: string): Promise<InventoryMovement[]> => {
  const q = query(
    collection(db, MOVEMENTS_COLLECTION),
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
