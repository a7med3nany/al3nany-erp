import {
  doc,
  collection,
  runTransaction,
  Timestamp,
  Transaction as FirestoreTransaction,
  getDocs,
  getDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
  PurchaseReturn,
  PurchaseReturnItem,
  Product,
  Warehouse,
  Supplier,
  Cashbox,
  InventoryItem,
  InventoryLayerTracker,
  InventoryLayer
} from '../types';

import {
  prepareStockInInTransaction,
  commitStockInInTransaction,
  prepareStockOutInTransaction,
  commitStockOutInTransaction,
  PreparedStockIn,
  PreparedStockOut
} from './inventoryService';

import {
  prepareSupplierTransactionInTransaction,
  commitSupplierTransactionInTransaction,
  PreparedSupplierTransaction
} from './supplierService';

import {
  prepareManualTransactionInTransaction,
  commitManualTransactionInTransaction,
  PreparedManualTransaction
} from './transactionService';

const INVOICES_COLLECTION = 'purchase_invoices';
const PURCHASE_RETURNS_COLLECTION = 'purchase_returns';
const PRODUCTS_COLLECTION = 'products';
const WAREHOUSES_COLLECTION = 'warehouses';
const SUPPLIERS_COLLECTION = 'suppliers';
const CASHBOXES_COLLECTION = 'cashboxes';
const INVENTORY_COLLECTION = 'inventory_items';
const INVENTORY_LAYERS_COLLECTION = 'inventory_layers';

const TOLERANCE = 0.0001;

// ==========================================
// 1. Data Interfaces
// ==========================================

export interface PurchaseInvoiceItemInput {
  lineId: string;
  productId: string;
  quantity: number;
  purchasePrice: number;
  sellPrice1?: number;
  sellPrice2?: number;
  sellPrice3?: number;
  sellPrice4?: number;
}

export interface CreatePurchaseInvoiceParams {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseInvoiceItemInput[];
  discount: number;
  additionalCharges: number;
  paidAmount: number;
  paymentMethod: 'cash' | 'credit' | 'partial';
  cashboxId?: string;
  createdBy: string;
}

// ==========================================
// Purchase Return Interfaces (New Architecture)
// ==========================================

export interface PurchaseReturnItemInput {
  lineId: string;
  productId: string;
  quantity: number;
  returnPrice?: number;
}

export interface CreatePurchaseReturnParams {
  returnId: string;
  returnNumber: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseReturnItemInput[];
  refundedAmount: number;
  cashboxId?: string;
  createdBy: string;
}

// ==========================================
// 2. Validation Helpers
// ==========================================

const validateInvoiceInput = (params: CreatePurchaseInvoiceParams) => {
  if (!params.invoiceId) {
    throw new Error('معرف الفاتورة (Invoice ID) مفقود.');
  }

  if (!params.supplierId) {
    throw new Error('يجب اختيار المورد.');
  }

  if (!params.warehouseId) {
    throw new Error('يجب اختيار المخزن.');
  }

  if (!params.invoiceNumber || params.invoiceNumber.trim() === '') {
    throw new Error('رقم الفاتورة مطلوب.');
  }

  if (!params.items || params.items.length === 0) {
    throw new Error('الفاتورة لا تحتوي على أصناف.');
  }

  if (!Number.isFinite(params.discount) || params.discount < 0) {
    throw new Error('قيمة الخصم غير صالحة أو سالبة.');
  }

  if (!Number.isFinite(params.additionalCharges) || params.additionalCharges < 0) {
    throw new Error('قيمة تكاليف الاقتناء غير صالحة أو سالبة.');
  }

  if (!Number.isFinite(params.paidAmount) || params.paidAmount < 0) {
    throw new Error('قيمة المبلغ المدفوع غير صالحة أو سالبة.');
  }

  if (!['cash', 'credit', 'partial'].includes(params.paymentMethod)) {
    throw new Error('طريقة الدفع غير صالحة. يجب أن تكون cash، credit، أو partial.');
  }

  const productIds = new Set<string>();
  const lineIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.lineId) throw new Error(`معرف السطر مفقود في الصنف رقم ${index + 1}`);
    if (lineIds.has(item.lineId)) throw new Error(`معرف السطر مكرر في الصنف رقم ${index + 1}.`);
    lineIds.add(item.lineId);

    if (!item.productId) throw new Error(`يجب اختيار المنتج في السطر رقم ${index + 1}`);
    
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`الكمية غير صالحة في السطر رقم ${index + 1}`);
    }

    if (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) {
      throw new Error(`سعر الشراء غير صالح في السطر رقم ${index + 1}`);
    }

    if (item.sellPrice1 !== undefined && (!Number.isFinite(item.sellPrice1) || item.sellPrice1 < 0)) {
      throw new Error(`سعر البيع 1 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice2 !== undefined && (!Number.isFinite(item.sellPrice2) || item.sellPrice2 < 0)) {
      throw new Error(`سعر البيع 2 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice3 !== undefined && (!Number.isFinite(item.sellPrice3) || item.sellPrice3 < 0)) {
      throw new Error(`سعر البيع 3 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice4 !== undefined && (!Number.isFinite(item.sellPrice4) || item.sellPrice4 < 0)) {
      throw new Error(`سعر البيع 4 غير صالح في السطر رقم ${index + 1}`);
    }

    if (productIds.has(item.productId)) {
      throw new Error(`المنتج مكرر في السطر رقم ${index + 1}. لا يمكن إضافة نفس المنتج أكثر من مرة في نفس الفاتورة.`);
    }

    productIds.add(item.productId);
  });

  if (params.paidAmount > 0 && !params.cashboxId) {
    throw new Error('يجب اختيار الخزينة عند وجود مبلغ مدفوع.');
  }
};

const validatePurchaseReturnInput = (params: CreatePurchaseReturnParams) => {
  if (!params.returnId) {
    throw new Error('معرف المرتجع (Return ID) مفقود.');
  }

  if (!params.returnNumber || params.returnNumber.trim() === '') {
    throw new Error('رقم المرتجع مطلوب.');
  }

  if (!params.supplierId) {
    throw new Error('معرف المورد مفقود.');
  }

  if (!params.warehouseId) {
    throw new Error('معرف المخزن مفقود.');
  }

  if (!params.items || params.items.length === 0) {
    throw new Error('المرتجع لا يحتوي على أصناف.');
  }

  if (!Number.isFinite(params.refundedAmount) || params.refundedAmount < 0) {
    throw new Error('قيمة المبلغ المسترد نقداً غير صالحة أو سالبة.');
  }

  if (params.refundedAmount > 0 && !params.cashboxId) {
    throw new Error('يجب اختيار الخزينة عند وجود مبلغ مسترد نقداً.');
  }

  const productIds = new Set<string>();
  const lineIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.lineId) {
      throw new Error(`معرف السطر مفقود في السطر رقم ${index + 1}.`);
    }

    if (lineIds.has(item.lineId)) {
      throw new Error(`معرف السطر مكرر في المرتجع: ${item.lineId}`);
    }

    lineIds.add(item.lineId);

    if (!item.productId) {
      throw new Error(`معرف المنتج مفقود في السطر رقم ${index + 1}.`);
    }

    if (productIds.has(item.productId)) {
      throw new Error(`المنتج مكرر في المرتجع. لا يمكن إرجاع نفس المنتج أكثر من مرة في نفس العملية.`);
    }

    productIds.add(item.productId);

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`كمية المرتجع غير صالحة في السطر رقم ${index + 1}. يجب أن تكون أكبر من صفر.`);
    }

    if (item.returnPrice !== undefined && (!Number.isFinite(item.returnPrice) || item.returnPrice < 0)) {
      throw new Error(`سعر المرتجع غير صالح في السطر رقم ${index + 1}.`);
    }
  });
};

// ==========================================
// Date Helper
// ==========================================

const toDateSafe = (value: unknown): Date => {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
};

// ==========================================
// 3. Core Purchase Invoice Service (Atomic)
// ==========================================

export const createPurchaseInvoice = async (
  params: CreatePurchaseInvoiceParams
): Promise<void> => {
  validateInvoiceInput(params);

  let subtotal = 0;

  const processedItems = params.items.map(item => {
    const grossLineTotal = Number((item.quantity * item.purchasePrice).toFixed(4));
    subtotal = Number((subtotal + grossLineTotal).toFixed(4));
    return { ...item, grossLineTotal };
  });

  if (subtotal === 0 && params.additionalCharges > 0) {
    throw new Error('لا يمكن توزيع تكاليف الاقتناء لأن إجمالي تكلفة الأصناف يساوي صفرًا.');
  }

  if (params.discount > subtotal) {
    throw new Error('قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة قبل الخصم.');
  }

  const totalAmount = Number((subtotal - params.discount + params.additionalCharges).toFixed(4));

  if (params.paidAmount > totalAmount) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.');
  }

  if (params.paymentMethod === 'cash' && params.paidAmount !== totalAmount) {
    throw new Error("طريقة الدفع 'نقدي' تتطلب دفع إجمالي الفاتورة بالكامل.");
  }

  if (params.paymentMethod === 'credit' && params.paidAmount !== 0) {
    throw new Error("طريقة الدفع 'آجل' تتطلب أن يكون المبلغ المدفوع صفراً.");
  }

  if (params.paymentMethod === 'partial' && (params.paidAmount <= 0 || params.paidAmount >= totalAmount)) {
    throw new Error("طريقة الدفع 'جزئي' تتطلب دفع مبلغ أكبر من صفر وأقل من الإجمالي.");
  }

  const remainingAmount = Number((totalAmount - params.paidAmount).toFixed(4));

  let remainingDiscountToAllocate = params.discount;
  let remainingChargesToAllocate = params.additionalCharges;
  let remainingTotalAmount = totalAmount;

  const invoiceItems: PurchaseInvoiceItem[] = processedItems.map((item, index) => {
    const isLastItem = index === processedItems.length - 1;
    let allocatedDiscount = 0;
    let allocatedAcquisitionCharges = 0;
    let totalCost = 0;

    if (subtotal > 0) {
      if (isLastItem) {
        allocatedDiscount = remainingDiscountToAllocate;
        allocatedAcquisitionCharges = remainingChargesToAllocate;
        totalCost = remainingTotalAmount;
      } else {
        const ratio = item.grossLineTotal / subtotal;
        allocatedDiscount = Number((params.discount * ratio).toFixed(4));
        remainingDiscountToAllocate = Number((remainingDiscountToAllocate - allocatedDiscount).toFixed(4));

        allocatedAcquisitionCharges = Number((params.additionalCharges * ratio).toFixed(4));
        remainingChargesToAllocate = Number((remainingChargesToAllocate - allocatedAcquisitionCharges).toFixed(4));

        totalCost = Number((item.grossLineTotal - allocatedDiscount + allocatedAcquisitionCharges).toFixed(4));
        remainingTotalAmount = Number((remainingTotalAmount - totalCost).toFixed(4));
      }
    }

    const netUnitCost = item.quantity > 0 ? totalCost / item.quantity : 0;

    return {
      lineId: item.lineId,
      productId: item.productId,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      grossLineTotal: item.grossLineTotal,
      allocatedDiscount,
      allocatedAcquisitionCharges,
      netUnitCost,
      totalCost,
      returnedQuantity: 0
    };
  });

  const calculatedDiscount = invoiceItems.reduce((sum, item) => sum + item.allocatedDiscount, 0);
  const calculatedCharges = invoiceItems.reduce((sum, item) => sum + item.allocatedAcquisitionCharges, 0);
  const calculatedTotalCost = invoiceItems.reduce((sum, item) => sum + item.totalCost, 0);

  if (Math.abs(calculatedDiscount - params.discount) > TOLERANCE) {
    throw new Error('خطأ محاسبي: مجموع الخصم الموزع لا يتطابق مع الخصم الإجمالي للفاتورة.');
  }

  if (Math.abs(calculatedCharges - params.additionalCharges) > TOLERANCE) {
    throw new Error('خطأ محاسبي: مجموع تكاليف الاقتناء الموزعة لا يتطابق مع الإجمالي.');
  }

  if (Math.abs(calculatedTotalCost - totalAmount) > TOLERANCE) {
    throw new Error('خطأ محاسبي: إجمالي تكلفة البنود لا يتطابق مع إجمالي الفاتورة.');
  }

  await runTransaction(db, async (transaction: FirestoreTransaction) => {
    // ======================================
    // A. READ / PREPARE PHASE
    // ======================================

    const invoiceRef = doc(db, INVOICES_COLLECTION, params.invoiceId);
    const invoiceSnap = await transaction.get(invoiceRef);

    if (invoiceSnap.exists()) {
      const existingData = invoiceSnap.data() as PurchaseInvoice;
      const isSameBasic =
        existingData.supplierId === params.supplierId &&
        existingData.warehouseId === params.warehouseId &&
        existingData.invoiceNumber === params.invoiceNumber &&
        existingData.subtotal === subtotal &&
        existingData.discount === params.discount &&
        existingData.additionalCharges === params.additionalCharges &&
        existingData.totalAmount === totalAmount &&
        existingData.paidAmount === params.paidAmount &&
        existingData.remainingAmount === remainingAmount &&
        existingData.paymentMethod === params.paymentMethod &&
        existingData.cashboxId === params.cashboxId &&
        existingData.items.length === invoiceItems.length;

      let isSameItems = true;
      if (isSameBasic) {
        for (const inItem of invoiceItems) {
          const exItem = existingData.items.find(e => e.lineId === inItem.lineId);
          if (
            !exItem ||
            exItem.productId !== inItem.productId ||
            exItem.quantity !== inItem.quantity ||
            exItem.purchasePrice !== inItem.purchasePrice ||
            exItem.grossLineTotal !== inItem.grossLineTotal ||
            exItem.allocatedDiscount !== inItem.allocatedDiscount ||
            exItem.allocatedAcquisitionCharges !== inItem.allocatedAcquisitionCharges ||
            exItem.netUnitCost !== inItem.netUnitCost ||
            exItem.totalCost !== inItem.totalCost
          ) {
            isSameItems = false;
            break;
          }
        }
      }

      if (isSameBasic && isSameItems) {
        return; // Idempotent Success
      }

      throw new Error('معرف الفاتورة مستخدم بالفعل لعملية مختلفة (البيانات لا تتطابق مع الطلب الحالي).');
    }

    const supplierRef = doc(db, SUPPLIERS_COLLECTION, params.supplierId);
    const supplierSnap = await transaction.get(supplierRef);

    if (!supplierSnap.exists() || (supplierSnap.data() as Supplier).isActive === false) {
      throw new Error('المورد غير موجود أو غير نشط.');
    }

    const warehouseRef = doc(db, WAREHOUSES_COLLECTION, params.warehouseId);
    const warehouseSnap = await transaction.get(warehouseRef);

    if (!warehouseSnap.exists() || (warehouseSnap.data() as Warehouse).isActive === false) {
      throw new Error('المخزن غير موجود أو غير نشط.');
    }

    let cashboxSnap = null;
    if (params.paidAmount > 0 && params.cashboxId) {
      const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);
      cashboxSnap = await transaction.get(cashboxRef);
      if (!cashboxSnap.exists() || (cashboxSnap.data() as Cashbox).isActive === false) {
        throw new Error('الخزينة المحددة للدفع غير موجودة أو غير نشطة.');
      }
    }

    const productRefs = invoiceItems.map(item => doc(db, PRODUCTS_COLLECTION, item.productId));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

    productSnaps.forEach((snap, index) => {
      if (!snap.exists() || (snap.data() as Product).isActive === false) {
        throw new Error(`المنتج في السطر رقم ${index + 1} غير موجود أو غير نشط.`);
      }
    });

    let preparedCashboxTx: PreparedManualTransaction | null = null;
    if (params.paidAmount > 0 && params.cashboxId) {
      preparedCashboxTx = await prepareManualTransactionInTransaction(
        transaction,
        {
          cashboxId: params.cashboxId,
          type: 'out',
          amount: params.paidAmount,
          referenceType: 'purchase_invoice',
          referenceId: params.invoiceId,
          description: `سداد فاتورة مشتريات (رقم: ${params.invoiceNumber})`,
          createdBy: params.createdBy
        },
        `cash_pur_${params.invoiceId}`
      );
    }

    let preparedSupplierTx: PreparedSupplierTransaction | null = null;
    if (remainingAmount > 0) {
      preparedSupplierTx = await prepareSupplierTransactionInTransaction(
        transaction,
        {
          supplierId: params.supplierId,
          type: 'in',
          amount: remainingAmount,
          referenceType: 'purchase_invoice',
          referenceId: params.invoiceId,
          description: `مشتريات آجلة (فاتورة رقم: ${params.invoiceNumber})`,
          createdBy: params.createdBy
        },
        `sup_pur_${params.invoiceId}`
      );
    }

    const preparedInventoryTxs: PreparedStockIn[] = [];
    for (const item of invoiceItems) {
      const preparedStockIn = await prepareStockInInTransaction(transaction, {
        productId: item.productId,
        warehouseId: params.warehouseId,
        quantity: item.quantity,
        unitCost: item.netUnitCost,
        referenceType: 'purchase_invoice',
        referenceId: params.invoiceId,
        sourceLineId: item.lineId,
        description: `شراء ضمن فاتورة رقم: ${params.invoiceNumber}`,
        createdBy: params.createdBy,
        supplierId: params.supplierId,
        purchaseInvoiceId: params.invoiceId,
        purchaseLineId: item.lineId
      });
      preparedInventoryTxs.push(preparedStockIn);
    }

    const now = Timestamp.now();

    // ======================================
    // B. WRITE / COMMIT PHASE
    // ======================================

    if (preparedCashboxTx) {
      commitManualTransactionInTransaction(transaction, preparedCashboxTx);
    }

    if (preparedSupplierTx) {
      commitSupplierTransactionInTransaction(transaction, preparedSupplierTx);
    }

    for (const preparedStock of preparedInventoryTxs) {
      commitStockInInTransaction(transaction, preparedStock);
    }

    invoiceItems.forEach((item, index) => {
      const inputItem = params.items.find(i => i.lineId === item.lineId);

      const productUpdateData: Partial<Product> = {
        lastPurchaseCost: item.netUnitCost,
        updatedAt: now as unknown as Date
      };

      if (inputItem?.sellPrice1 !== undefined) productUpdateData.price1 = inputItem.sellPrice1;
      if (inputItem?.sellPrice2 !== undefined) productUpdateData.price2 = inputItem.sellPrice2;
      if (inputItem?.sellPrice3 !== undefined) productUpdateData.price3 = inputItem.sellPrice3;
      if (inputItem?.sellPrice4 !== undefined) productUpdateData.price4 = inputItem.sellPrice4;

      transaction.update(productRefs[index], productUpdateData);
    });

    const invoiceData: Omit<PurchaseInvoice, 'id'> = {
      invoiceNumber: params.invoiceNumber,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      items: invoiceItems,
      subtotal,
      discount: params.discount,
      additionalCharges: params.additionalCharges,
      totalAmount,
      paidAmount: params.paidAmount,
      remainingAmount,
      paymentMethod: params.paymentMethod,
      cashboxId: params.paidAmount > 0 ? params.cashboxId : undefined,
      status: 'completed',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date
    };

    transaction.set(invoiceRef, invoiceData);
  });
};

// ==========================================
// 4. Purchase Return Service (Layer Architecture)
// ==========================================

export const createPurchaseReturn = async (
  params: CreatePurchaseReturnParams
): Promise<void> => {
  validatePurchaseReturnInput(params);

  await runTransaction(db, async (transaction: FirestoreTransaction) => {
    // ======================================
    // A. READ PHASE
    // ======================================

    const returnRef = doc(db, PURCHASE_RETURNS_COLLECTION, params.returnId);
    const returnSnap = await transaction.get(returnRef);

    const supplierRef = doc(db, SUPPLIERS_COLLECTION, params.supplierId);
    const supplierSnap = await transaction.get(supplierRef);

    const warehouseRef = doc(db, WAREHOUSES_COLLECTION, params.warehouseId);
    const warehouseSnap = await transaction.get(warehouseRef);

    let cashboxSnap = null;
    if (params.refundedAmount > 0 && params.cashboxId) {
      const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);
      cashboxSnap = await transaction.get(cashboxRef);
      if (!cashboxSnap.exists() || (cashboxSnap.data() as Cashbox).isActive === false) {
        throw new Error('الخزينة المحددة للاسترداد غير موجودة أو غير نشطة.');
      }
    }

    const productRefs = params.items.map(item => doc(db, PRODUCTS_COLLECTION, item.productId));
    const invItemRefs = params.items.map(item => doc(db, INVENTORY_COLLECTION, `${params.warehouseId}_${item.productId}`));
    const layerTrackerRefs = params.items.map(item => doc(db, INVENTORY_LAYERS_COLLECTION, `${params.warehouseId}_${item.productId}`));
    
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const invItemSnaps = await Promise.all(invItemRefs.map(ref => transaction.get(ref)));
    const layerTrackerSnaps = await Promise.all(layerTrackerRefs.map(ref => transaction.get(ref)));

    // ======================================
    // B. CALCULATE / VALIDATE PHASE
    // ======================================

    if (!supplierSnap.exists() || (supplierSnap.data() as Supplier).isActive === false) {
      throw new Error('المورد غير موجود أو غير نشط.');
    }

    if (!warehouseSnap.exists() || (warehouseSnap.data() as Warehouse).isActive === false) {
      throw new Error('المخزن غير موجود أو غير نشط.');
    }

    productSnaps.forEach((snap, index) => {
      if (!snap.exists() || (snap.data() as Product).isActive === false) {
        throw new Error(`المنتج المطلوب إرجاعه في السطر ${index + 1} غير موجود أو غير نشط.`);
      }
    });

    let totalReturnAmount = 0;
    const resolvedItems: PurchaseReturnItem[] = [];

    for (let i = 0; i < params.items.length; i++) {
      const inputItem = params.items[i];
      const invSnap = invItemSnaps[i];
      const trackerSnap = layerTrackerSnaps[i];

      if (!invSnap.exists()) {
        throw new Error('لا توجد بيانات مخزون صالحة لهذا المنتج في المخزن المحدد.');
      }
      
      const invData = invSnap.data() as InventoryItem;
      if (!Number.isFinite(invData.wac)) {
        throw new Error('لا توجد بيانات مخزون صالحة لهذا المنتج في المخزن المحدد.');
      }

      // 1. Verify Supplier Capacity from Active Layers
      let supplierAvailableQty = 0;
      if (trackerSnap.exists()) {
        const trackerData = trackerSnap.data() as InventoryLayerTracker;
        const activeLayers = trackerData.activeLayers || [];
        for (const layer of activeLayers) {
          if (!layer.isLegacy && layer.supplierId === params.supplierId && layer.remainingQuantity > 0) {
            supplierAvailableQty += layer.remainingQuantity;
          }
        }
      }

      if (supplierAvailableQty + TOLERANCE < inputItem.quantity) {
        throw new Error('لا توجد كمية متاحة لإرجاع هذا المنتج من المورد المحدد في هذا المخزن.');
      }

      // 2. Resolve Return Price
      const finalReturnPrice = inputItem.returnPrice !== undefined ? inputItem.returnPrice : invData.wac;
      const lineTotalAmount = Number((inputItem.quantity * finalReturnPrice).toFixed(4));
      
      totalReturnAmount = Number((totalReturnAmount + lineTotalAmount).toFixed(4));

      resolvedItems.push({
        lineId: `retline_${params.returnId}_${inputItem.lineId}`,
        productId: inputItem.productId,
        quantity: inputItem.quantity,
        returnPrice: finalReturnPrice,
        totalAmount: lineTotalAmount,
        originalLineId: undefined
      });
    }

    if (totalReturnAmount <= 0) {
      throw new Error('إجمالي قيمة المرتجع يجب أن يكون أكبر من صفر.');
    }

    if (params.refundedAmount > totalReturnAmount + TOLERANCE) {
      throw new Error('المبلغ المسترد نقداً لا يمكن أن يتجاوز قيمة المرتجع الإجمالية.');
    }

    const supplierCreditAmount = Number((totalReturnAmount - params.refundedAmount).toFixed(4));

    // 3. Strict Idempotency Check
    if (returnSnap.exists()) {
      const existingData = returnSnap.data() as PurchaseReturn;
      const isBasicMatch =
        existingData.returnNumber === params.returnNumber &&
        existingData.supplierId === params.supplierId &&
        existingData.warehouseId === params.warehouseId &&
        existingData.refundedAmount === params.refundedAmount &&
        existingData.cashboxId === params.cashboxId &&
        existingData.totalAmount === totalReturnAmount &&
        existingData.supplierCreditAmount === supplierCreditAmount &&
        existingData.items.length === resolvedItems.length;

      let isItemsMatch = true;
      if (isBasicMatch) {
        for (const resItem of resolvedItems) {
          const exItem = existingData.items.find(e => e.lineId === resItem.lineId);
          if (!exItem || exItem.productId !== resItem.productId || exItem.quantity !== resItem.quantity || exItem.returnPrice !== resItem.returnPrice) {
            isItemsMatch = false;
            break;
          }
        }
      }
      
      if (isBasicMatch && isItemsMatch) {
        return; // Idempotent Success
      }
      
      throw new Error('معرف المرتجع مستخدم بالفعل لعملية مختلفة (البيانات لا تتطابق مع الطلب الحالي).');
    }

    // ======================================
    // C. PREPARE PHASE
    // ======================================

    const preparedStockOuts: PreparedStockOut[] = [];
    
    for (let i = 0; i < params.items.length; i++) {
      const inputItem = params.items[i];
      const preparedOut = await prepareStockOutInTransaction(transaction, {
        productId: inputItem.productId,
        warehouseId: params.warehouseId,
        quantity: inputItem.quantity,
        referenceType: 'purchase_return',
        referenceId: params.returnId,
        sourceLineId: inputItem.lineId,
        description: `مرتجع مشتريات للمورد`,
        createdBy: params.createdBy,
        supplierId: params.supplierId
      });
      preparedStockOuts.push(preparedOut);
    }

    let preparedCashboxTx: PreparedManualTransaction | null = null;
    if (params.refundedAmount > 0) {
      preparedCashboxTx = await prepareManualTransactionInTransaction(
        transaction,
        {
          cashboxId: params.cashboxId!,
          type: 'in',
          amount: params.refundedAmount,
          referenceType: 'purchase_return',
          referenceId: params.returnId,
          description: `استرداد نقدي من المورد لمرتجع رقم: ${params.returnNumber}`,
          createdBy: params.createdBy
        },
        `cash_pur_return_${params.returnId}`
      );
    }

    let preparedSupplierTx: PreparedSupplierTransaction | null = null;
    if (supplierCreditAmount > 0) {
      preparedSupplierTx = await prepareSupplierTransactionInTransaction(
        transaction,
        {
          supplierId: params.supplierId,
          type: 'out',
          amount: supplierCreditAmount,
          referenceType: 'purchase_return',
          referenceId: params.returnId,
          description: `تخفيض مديونية المورد بسبب مرتجع رقم: ${params.returnNumber}`,
          createdBy: params.createdBy
        },
        `sup_pur_return_${params.returnId}`
      );
    }

    const now = Timestamp.now();

    // ======================================
    // D. COMMIT PHASE
    // ======================================

    for (const preparedStock of preparedStockOuts) {
      commitStockOutInTransaction(transaction, preparedStock);
    }

    if (preparedCashboxTx) {
      commitManualTransactionInTransaction(transaction, preparedCashboxTx);
    }

    if (preparedSupplierTx) {
      commitSupplierTransactionInTransaction(transaction, preparedSupplierTx);
    }

    const returnData: Omit<PurchaseReturn, 'id'> = {
      returnNumber: params.returnNumber,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      items: resolvedItems,
      totalAmount: totalReturnAmount,
      refundedAmount: params.refundedAmount,
      supplierCreditAmount: supplierCreditAmount,
      cashboxId: params.refundedAmount > 0 ? params.cashboxId : undefined,
      status: 'completed',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
      originalPurchaseInvoiceId: undefined
    };

    transaction.set(returnRef, returnData);
  });
};

// ==========================================
// 5. Public Queries & Helpers
// ==========================================

export const getPurchaseInvoices = async (): Promise<PurchaseInvoice[]> => {
  const q = query(
    collection(db, INVOICES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDateSafe(data.createdAt),
      updatedAt: toDateSafe(data.updatedAt)
    } as PurchaseInvoice;
  });
};

export const getPurchaseInvoiceById = async (id: string): Promise<PurchaseInvoice | null> => {
  const invoiceRef = doc(db, INVOICES_COLLECTION, id);
  const snap = await getDoc(invoiceRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: toDateSafe(data.createdAt),
    updatedAt: toDateSafe(data.updatedAt)
  } as PurchaseInvoice;
};

export const getPurchaseReturns = async (): Promise<PurchaseReturn[]> => {
  const q = query(
    collection(db, PURCHASE_RETURNS_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDateSafe(data.createdAt),
      updatedAt: toDateSafe(data.updatedAt)
    } as PurchaseReturn;
  });
};

export const getPurchaseReturnById = async (id: string): Promise<PurchaseReturn | null> => {
  const returnRef = doc(db, PURCHASE_RETURNS_COLLECTION, id);
  const snap = await getDoc(returnRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: toDateSafe(data.createdAt),
    updatedAt: toDateSafe(data.updatedAt)
  } as PurchaseReturn;
};
