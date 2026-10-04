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
  InventoryReferenceType,
  InventoryLayerTracker,
  InventoryLayer
} from '../types';

const INVENTORY_COLLECTION = 'inventory_items';
const MOVEMENTS_COLLECTION = 'inventory_movements';
const LAYER_TRACKERS_COLLECTION = 'inventory_layers';

const TOLERANCE = 0.0001;

// ==========================================
// 1. Backward Compatibility Interfaces (Old API)
// ==========================================

export interface StockItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
  sourceLineId?: string;
  supplierId?: string;
  purchaseInvoiceId?: string;
  purchaseLineId?: string;
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
  supplierId?: string;
  purchaseInvoiceId?: string;
  purchaseLineId?: string;
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
  supplierId?: string; // Required for Purchase Return (LIFO Filter)
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
  trackerRef: any;
  trackerData?: InventoryLayerTracker;
}

export interface PreparedStockOut {
  isIdempotent: boolean;
  movementRef: any;
  movementData?: Omit<InventoryMovement, 'id'>;
  itemRef: any;
  itemUpdateData?: Partial<InventoryItem>;
  trackerRef: any;
  trackerData?: InventoryLayerTracker;
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
  sourceTrackerRef: any;
  sourceTrackerData?: InventoryLayerTracker;
  destTrackerRef: any;
  destTrackerData?: InventoryLayerTracker;
}

// ==========================================
// 3. Validation & Helpers
// ==========================================

const validateQuantity = (qty: number) => {
  if (!Number.isFinite(qty) || Number.isNaN(qty) || qty <= 0) {
    throw new Error('الكمية يجب أن تكون رقماً صحيحاً وموجباً.');
  }
};

const generateMovementId = (refType: string, refId: string, type: string, lineId?: string) => {
  return `mov_${refType}_${refId}_${lineId || 'main'}_${type}`;
};

const getLayerTrackerId = (warehouseId: string, productId: string) => {
  return `${warehouseId}_${productId}`;
};

export const toDateSafe = (value: any): Date => {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const getLegacyLayer = (warehouseId: string, productId: string, oldQuantity: number, oldWac: number, createdAtDate: Date): InventoryLayer => ({
  layerId: `legacy_${warehouseId}_${productId}`,
  supplierId: 'UNKNOWN',
  purchaseInvoiceId: 'LEGACY',
  purchaseLineId: 'LEGACY',
  unitCost: oldWac,
  originalQuantity: oldQuantity,
  remainingQuantity: oldQuantity,
  createdAt: createdAtDate,
  isLegacy: true,
});

const validateLayerConsistency = (activeLayers: InventoryLayer[], inventoryQuantity: number) => {
  const layersQuantity = activeLayers.reduce((sum, layer) => sum + layer.remainingQuantity, 0);
  if (Math.abs(layersQuantity - inventoryQuantity) > TOLERANCE) {
    throw new Error(`تعارض في بيانات المخزون والطبقات. يرجى مراجعة المخزون قبل تنفيذ العملية. (مجموع الطبقات: ${layersQuantity}، الرصيد الفعلي: ${inventoryQuantity})`);
  }
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
  const layerTrackerId = getLayerTrackerId(params.warehouseId, params.productId);
  
  const movementRef = doc(db, MOVEMENTS_COLLECTION, generatedMovementId);
  const itemRef = doc(db, INVENTORY_COLLECTION, `${params.warehouseId}_${params.productId}`);
  const trackerRef = doc(db, LAYER_TRACKERS_COLLECTION, layerTrackerId);

  // Read Phase: Sequential Reads inside Transaction
  const movementSnap = await transaction.get(movementRef);
  const itemSnap = await transaction.get(itemRef);
  const trackerSnap = await transaction.get(trackerRef);

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
      return { isIdempotent: true, movementRef, itemRef, trackerRef };
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
  
  // WAC Calculation (Retains existing solid logic)
  let newWac = params.unitCost;
  if (newQuantity > 0) {
    const totalOldValue = oldQuantity * oldWac;
    const totalNewValue = params.quantity * params.unitCost;
    newWac = Number(((totalOldValue + totalNewValue) / newQuantity).toFixed(4));
  }
  
  const newInventoryValue = Number((newQuantity * newWac).toFixed(4));

  // Layer Tracker Handling
  let trackerData: InventoryLayerTracker;
  if (trackerSnap.exists()) {
    trackerData = trackerSnap.data() as InventoryLayerTracker;
  } else {
    trackerData = {
      id: layerTrackerId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      activeLayers: [],
      updatedAt: now as unknown as Date
    };
  }

  // Inject Legacy Layer if needed before adding new stock
  if (!isNewItem && oldQuantity > 0 && trackerData.activeLayers.length === 0) {
    const itemLastUpdated = itemSnap.data()?.lastUpdatedAt ? toDateSafe(itemSnap.data()?.lastUpdatedAt) : now.toDate();
    trackerData.activeLayers.push(getLegacyLayer(params.warehouseId, params.productId, oldQuantity, oldWac, itemLastUpdated));
  }

  // Create deterministic Layer ID specific to Purchase or fallback
  let newLayerId = `layer_${params.referenceType}_${params.referenceId}_${params.sourceLineId || 'main'}`;
  if (params.referenceType === 'purchase_invoice' && params.purchaseInvoiceId && params.purchaseLineId) {
    newLayerId = `layer_purchase_${params.purchaseInvoiceId}_${params.purchaseLineId}`;
  }
  
  const existingLayerIndex = trackerData.activeLayers.findIndex(l => l.layerId === newLayerId);
  if (existingLayerIndex === -1) {
    trackerData.activeLayers.push({
      layerId: newLayerId,
      supplierId: params.supplierId || 'UNKNOWN',
      purchaseInvoiceId: params.purchaseInvoiceId || params.referenceId,
      purchaseLineId: params.purchaseLineId || params.sourceLineId || 'main',
      unitCost: params.unitCost, // Historical Cost / Net Unit Cost
      originalQuantity: params.quantity,
      remainingQuantity: params.quantity,
      createdAt: now as unknown as Date
    });
  }

  trackerData.updatedAt = now as unknown as Date;

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

  // Validate Layer Consistency before returning
  validateLayerConsistency(trackerData.activeLayers, newQuantity);

  return {
    isIdempotent: false,
    movementRef,
    movementData,
    itemRef,
    itemData,
    isNewItem,
    trackerRef,
    trackerData
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

  if (prepared.movementData && prepared.itemData && prepared.trackerData) {
    transaction.set(prepared.movementRef, prepared.movementData);
    transaction.set(prepared.trackerRef, prepared.trackerData);
    
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
  const layerTrackerId = getLayerTrackerId(params.warehouseId, params.productId);
  
  const movementRef = doc(db, MOVEMENTS_COLLECTION, generatedMovementId);
  const itemRef = doc(db, INVENTORY_COLLECTION, `${params.warehouseId}_${params.productId}`);
  const trackerRef = doc(db, LAYER_TRACKERS_COLLECTION, layerTrackerId);

  // Read Phase: Sequential Reads
  const movementSnap = await transaction.get(movementRef);
  const itemSnap = await transaction.get(itemRef);
  const trackerSnap = await transaction.get(trackerRef);

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
      return { isIdempotent: true, movementRef, itemRef, trackerRef };
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

  const now = Timestamp.now();

  // Layer Tracker Handling
  let trackerData: InventoryLayerTracker;
  if (trackerSnap.exists()) {
    trackerData = trackerSnap.data() as InventoryLayerTracker;
  } else {
    trackerData = {
      id: layerTrackerId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      activeLayers: [],
      updatedAt: now as unknown as Date
    };
  }

  if (currentQuantity > 0 && trackerData.activeLayers.length === 0) {
    const itemLastUpdated = currentItem.lastUpdatedAt ? toDateSafe(currentItem.lastUpdatedAt) : now.toDate();
    trackerData.activeLayers.push(getLegacyLayer(params.warehouseId, params.productId, currentQuantity, currentWac, itemLastUpdated));
  }

  let remainingToDeduct = params.quantity;

  // Layer Consumption Logic (LIFO vs FIFO)
  if (params.referenceType === 'purchase_return') {
    // Supplier-filtered LIFO
    if (!params.supplierId) {
      throw new Error("معرف المورد مطلوب لإجراء مرتجع المشتريات.");
    }
    
    const validLayers = trackerData.activeLayers.filter(l => l.supplierId === params.supplierId && !l.isLegacy);
    const totalAvailableFromSupplier = validLayers.reduce((sum, l) => sum + l.remainingQuantity, 0);

    if (totalAvailableFromSupplier < params.quantity) {
      throw new Error("لا توجد كمية متاحة لإرجاع هذا المنتج من المورد المحدد في هذا المخزن.");
    }

    // Sort valid layers by creation date descending (LIFO: Newest first)
    validLayers.sort((a, b) => toDateSafe(b.createdAt).getTime() - toDateSafe(a.createdAt).getTime());

    for (const layer of validLayers) {
      if (remainingToDeduct <= 0) break;
      const targetLayer = trackerData.activeLayers.find(l => l.layerId === layer.layerId)!;
      
      const deduct = Math.min(targetLayer.remainingQuantity, remainingToDeduct);
      targetLayer.remainingQuantity = Number((targetLayer.remainingQuantity - deduct).toFixed(4));
      remainingToDeduct = Number((remainingToDeduct - deduct).toFixed(4));
    }
  } else {
    // Sales / General Stock Out (FIFO)
    // Sort all layers ascending by creation date (FIFO: Oldest first)
    const sortedLayers = [...trackerData.activeLayers].sort((a, b) => toDateSafe(a.createdAt).getTime() - toDateSafe(b.createdAt).getTime());

    for (const layer of sortedLayers) {
      if (remainingToDeduct <= 0) break;
      const targetLayer = trackerData.activeLayers.find(l => l.layerId === layer.layerId)!;
      if (targetLayer.remainingQuantity <= 0) continue;

      const deduct = Math.min(targetLayer.remainingQuantity, remainingToDeduct);
      targetLayer.remainingQuantity = Number((targetLayer.remainingQuantity - deduct).toFixed(4));
      remainingToDeduct = Number((remainingToDeduct - deduct).toFixed(4));
    }

    // Fallback if data is historically out of sync but item quantity is allowed to be deducted
    if (remainingToDeduct > TOLERANCE) {
      throw new Error(`تعارض في بيانات الطبقات: الكمية التفصيلية المتبقية غير كافية للسحب.`);
    }
  }

  // Cleanup exhausted layers
  trackerData.activeLayers = trackerData.activeLayers.filter(l => l.remainingQuantity > TOLERANCE);
  trackerData.updatedAt = now as unknown as Date;

  const newQuantity = Number((currentQuantity - params.quantity).toFixed(4));
  const newInventoryValue = Number((newQuantity * currentWac).toFixed(4));

  // Validate Layer Consistency before returning
  validateLayerConsistency(trackerData.activeLayers, newQuantity);

  const movementData: Omit<InventoryMovement, 'id'> = {
    productId: params.productId,
    warehouseId: params.warehouseId,
    type: params.referenceType === 'transfer' ? 'transfer_out' : 'stock_out',
    flow: 'out',
    quantityIn: 0,
    quantityOut: params.quantity,
    balanceAfter: newQuantity,
    unitCost: currentWac, // Inventory value is reduced by WAC
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
    itemUpdateData,
    trackerRef,
    trackerData
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

  if (prepared.movementData && prepared.itemUpdateData && prepared.trackerData) {
    transaction.set(prepared.movementRef, prepared.movementData);
    transaction.set(prepared.trackerRef, prepared.trackerData);
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

  const sourceTrackerId = getLayerTrackerId(params.sourceWarehouseId, params.productId);
  const destTrackerId = getLayerTrackerId(params.destWarehouseId, params.productId);

  const sourceTrackerRef = doc(db, LAYER_TRACKERS_COLLECTION, sourceTrackerId);
  const destTrackerRef = doc(db, LAYER_TRACKERS_COLLECTION, destTrackerId);

  // Read Phase: Sequential Reads
  const outMovementSnap = await transaction.get(outMovementRef);
  const inMovementSnap = await transaction.get(inMovementRef);
  const sourceItemSnap = await transaction.get(sourceItemRef);
  const destItemSnap = await transaction.get(destItemRef);
  const sourceTrackerSnap = await transaction.get(sourceTrackerRef);
  const destTrackerSnap = await transaction.get(destTrackerRef);

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
      outMove.quantityOut === params.quantity &&
      outMove.type === 'transfer_out';

    const isInMatch = 
      inMove.referenceId === params.transferId &&
      inMove.productId === params.productId &&
      inMove.warehouseId === params.destWarehouseId &&
      inMove.quantityIn === params.quantity &&
      inMove.type === 'transfer_in';

    if (isOutMatch && isInMatch) {
      return { 
        isIdempotent: true, outMovementRef, inMovementRef, sourceItemRef, destItemRef, sourceTrackerRef, destTrackerRef 
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
  const sourceWac = Number.isFinite(sourceItem.wac) ? sourceItem.wac : 0; 

  if (sourceQuantity < params.quantity) {
    throw new Error(`رصيد المخزن المصدر لا يكفي. المتاح: ${sourceQuantity}, المطلوب: ${params.quantity}`);
  }

  const now = Timestamp.now();
  const newSourceQuantity = Number((sourceQuantity - params.quantity).toFixed(4));
  const newSourceInventoryValue = Number((newSourceQuantity * sourceWac).toFixed(4));

  // Initialize Source Tracker
  let sourceTrackerData: InventoryLayerTracker;
  if (sourceTrackerSnap.exists()) {
    sourceTrackerData = sourceTrackerSnap.data() as InventoryLayerTracker;
  } else {
    sourceTrackerData = {
      id: sourceTrackerId,
      warehouseId: params.sourceWarehouseId,
      productId: params.productId,
      activeLayers: [],
      updatedAt: now as unknown as Date
    };
  }

  if (sourceQuantity > 0 && sourceTrackerData.activeLayers.length === 0) {
    const itemLastUpdated = sourceItem.lastUpdatedAt ? toDateSafe(sourceItem.lastUpdatedAt) : now.toDate();
    sourceTrackerData.activeLayers.push(getLegacyLayer(params.sourceWarehouseId, params.productId, sourceQuantity, sourceWac, itemLastUpdated));
  }

  // Consume from Source (FIFO)
  let remainingToTransfer = params.quantity;
  const sortedSourceLayers = [...sourceTrackerData.activeLayers].sort((a, b) => toDateSafe(a.createdAt).getTime() - toDateSafe(b.createdAt).getTime());
  const derivedLayers: InventoryLayer[] = [];

  for (const layer of sortedSourceLayers) {
    if (remainingToTransfer <= 0) break;
    const targetLayer = sourceTrackerData.activeLayers.find(l => l.layerId === layer.layerId)!;
    if (targetLayer.remainingQuantity <= 0) continue;

    const deduct = Math.min(targetLayer.remainingQuantity, remainingToTransfer);
    targetLayer.remainingQuantity = Number((targetLayer.remainingQuantity - deduct).toFixed(4));
    remainingToTransfer = Number((remainingToTransfer - deduct).toFixed(4));

    // Create Derived Layer for Destination
    derivedLayers.push({
      layerId: `trans_${params.transferId}_${targetLayer.layerId}`,
      supplierId: targetLayer.supplierId,
      purchaseInvoiceId: targetLayer.purchaseInvoiceId,
      purchaseLineId: targetLayer.purchaseLineId,
      unitCost: targetLayer.unitCost, // Inherit historical cost
      originalQuantity: deduct,
      remainingQuantity: deduct,
      createdAt: now.toDate(), // Date it entered destination warehouse
      isLegacy: targetLayer.isLegacy,
      parentLayerId: targetLayer.layerId // Lineage tracking
    });
  }

  if (remainingToTransfer > TOLERANCE) {
    throw new Error(`تعارض في بيانات الطبقات: الكمية التفصيلية في المخزن المصدر غير كافية للنقل.`);
  }

  sourceTrackerData.activeLayers = sourceTrackerData.activeLayers.filter(l => l.remainingQuantity > TOLERANCE);
  sourceTrackerData.updatedAt = now as unknown as Date;

  // Initialize Dest Tracker
  const isNewDestItem = !destItemSnap.exists();
  let destQuantity = 0;
  let destWac = 0;

  if (!isNewDestItem) {
    const destItem = destItemSnap.data() as InventoryItem;
    destQuantity = Number.isFinite(destItem.quantity) ? destItem.quantity : 0;
    destWac = Number.isFinite(destItem.wac) ? destItem.wac : 0;
  }

  let destTrackerData: InventoryLayerTracker;
  if (destTrackerSnap.exists()) {
    destTrackerData = destTrackerSnap.data() as InventoryLayerTracker;
  } else {
    destTrackerData = {
      id: destTrackerId,
      warehouseId: params.destWarehouseId,
      productId: params.productId,
      activeLayers: [],
      updatedAt: now as unknown as Date
    };
  }

  if (!isNewDestItem && destQuantity > 0 && destTrackerData.activeLayers.length === 0) {
    const destItemRaw = destItemSnap.data() as InventoryItem;
    const destLastUpdated = destItemRaw.lastUpdatedAt ? toDateSafe(destItemRaw.lastUpdatedAt) : now.toDate();
    destTrackerData.activeLayers.push(getLegacyLayer(params.destWarehouseId, params.productId, destQuantity, destWac, destLastUpdated));
  }

  // Add derived layers to Dest Tracker with Idempotency check via findIndex
  for (const dLayer of derivedLayers) {
    const existingIndex = destTrackerData.activeLayers.findIndex(l => l.layerId === dLayer.layerId);
    if (existingIndex === -1) {
      destTrackerData.activeLayers.push(dLayer);
    }
  }
  
  destTrackerData.updatedAt = now as unknown as Date;

  const newDestQuantity = Number((destQuantity + params.quantity).toFixed(4));
  
  // Dest WAC Calculation (Retained logic)
  let newDestWac = sourceWac;
  if (newDestQuantity > 0) {
    const totalOldValue = destQuantity * destWac;
    const totalNewValue = params.quantity * sourceWac;
    newDestWac = Number(((totalOldValue + totalNewValue) / newDestQuantity).toFixed(4));
  }

  const newDestInventoryValue = Number((newDestQuantity * newDestWac).toFixed(4));

  // Validate Layer Consistency before returning
  validateLayerConsistency(sourceTrackerData.activeLayers, newSourceQuantity);
  validateLayerConsistency(destTrackerData.activeLayers, newDestQuantity);

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
    isNewDestItem,
    sourceTrackerRef,
    sourceTrackerData,
    destTrackerRef,
    destTrackerData
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

  if (prepared.outMovementData && prepared.inMovementData && prepared.sourceItemUpdateData && prepared.destItemData && prepared.sourceTrackerData && prepared.destTrackerData) {
    transaction.set(prepared.outMovementRef, prepared.outMovementData);
    transaction.set(prepared.inMovementRef, prepared.inMovementData);
    
    transaction.set(prepared.sourceTrackerRef, prepared.sourceTrackerData);
    transaction.set(prepared.destTrackerRef, prepared.destTrackerData);

    transaction.update(prepared.sourceItemRef, prepared.sourceItemUpdateData);
    
    if (prepared.isNewDestItem) {
      transaction.set(prepared.destItemRef, prepared.destItemData);
    } else {
      transaction.update(prepared.destItemRef, prepared.destItemData);
    }
  }
};

// ==========================================
// 10. Backward Compatibility Orchestrators
// ==========================================

export const processStockInInTransaction = async (
  transaction: FirestoreTransaction,
  params: ProcessStockInParams | StockOperationParams
): Promise<void> => {
  if ('items' in params) {
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
        createdBy: params.createdBy,
        supplierId: item.supplierId,
        purchaseInvoiceId: item.purchaseInvoiceId,
        purchaseLineId: item.purchaseLineId
      }));
    }
    for (const prepared of prepares) {
      commitStockInInTransaction(transaction, prepared);
    }
  } else {
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
        createdBy: params.createdBy,
        supplierId: item.supplierId
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
