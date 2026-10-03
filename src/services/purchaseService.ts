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
  Product,
  Warehouse,
  Supplier,
  Cashbox
} from '../types';

// استدعاء الدوال الذرية المجزأة (Prepare / Commit)
import { prepareStockInInTransaction, commitStockInInTransaction, PreparedStockIn } from './inventoryService';
import { prepareSupplierTransactionInTransaction, commitSupplierTransactionInTransaction, PreparedSupplierTransaction } from './supplierService';
import { prepareManualTransactionInTransaction, commitManualTransactionInTransaction, PreparedManualTransaction } from './transactionService';

const INVOICES_COLLECTION = 'purchase_invoices';
const PRODUCTS_COLLECTION = 'products';
const WAREHOUSES_COLLECTION = 'warehouses';
const SUPPLIERS_COLLECTION = 'suppliers';
const CASHBOXES_COLLECTION = 'cashboxes';

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
  invoiceId: string; // Idempotency Key (يجب أن يكون ثابتاً من الواجهة)
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
// 2. Validation Helpers
// ==========================================

const validateInvoiceInput = (params: CreatePurchaseInvoiceParams) => {
  if (!params.invoiceId) throw new Error("معرف الفاتورة (Invoice ID) مفقود.");
  if (!params.supplierId) throw new Error("يجب اختيار المورد.");
  if (!params.warehouseId) throw new Error("يجب اختيار المخزن.");
  if (!params.invoiceNumber || params.invoiceNumber.trim() === '') throw new Error("رقم الفاتورة مطلوب.");
  if (!params.items || params.items.length === 0) throw new Error("الفاتورة لا تحتوي على أصناف.");
  
  // Number.isFinite Validations
  if (!Number.isFinite(params.discount)) throw new Error("قيمة الخصم غير صالحة.");
  if (!Number.isFinite(params.additionalCharges)) throw new Error("قيمة تكاليف الاقتناء غير صالحة.");
  if (!Number.isFinite(params.paidAmount)) throw new Error("قيمة المبلغ المدفوع غير صالحة.");

  if (params.discount < 0) throw new Error("قيمة الخصم لا يمكن أن تكون سالبة.");
  if (params.additionalCharges < 0) throw new Error("تكاليف الاقتناء لا يمكن أن تكون سالبة.");
  if (params.paidAmount < 0) throw new Error("المبلغ المدفوع لا يمكن أن يكون سالباً.");

  if (!['cash', 'credit', 'partial'].includes(params.paymentMethod)) {
    throw new Error("طريقة الدفع غير صالحة. يجب أن تكون cash، credit، أو partial.");
  }

  const productIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.lineId) throw new Error(`معرف السطر مفقود في الصنف رقم ${index + 1}`);
    if (!item.productId) throw new Error(`يجب اختيار المنتج في السطر رقم ${index + 1}`);
    
    if (!Number.isFinite(item.quantity)) throw new Error(`الكمية ليست رقماً صالحاً في السطر رقم ${index + 1}`);
    if (item.quantity <= 0) throw new Error(`الكمية غير صالحة في السطر رقم ${index + 1}`);
    
    if (!Number.isFinite(item.purchasePrice)) throw new Error(`سعر الشراء ليس رقماً صالحاً في السطر رقم ${index + 1}`);
    if (item.purchasePrice < 0) throw new Error(`سعر الشراء غير صالح في السطر رقم ${index + 1}`);
    
    // التحقق من أسعار البيع (إذا وُجدت)
    if (item.sellPrice1 !== undefined) {
      if (!Number.isFinite(item.sellPrice1)) throw new Error(`سعر البيع 1 ليس رقماً صالحاً في السطر رقم ${index + 1}`);
      if (item.sellPrice1 < 0) throw new Error(`سعر البيع 1 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice2 !== undefined) {
      if (!Number.isFinite(item.sellPrice2)) throw new Error(`سعر البيع 2 ليس رقماً صالحاً في السطر رقم ${index + 1}`);
      if (item.sellPrice2 < 0) throw new Error(`سعر البيع 2 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice3 !== undefined) {
      if (!Number.isFinite(item.sellPrice3)) throw new Error(`سعر البيع 3 ليس رقماً صالحاً في السطر رقم ${index + 1}`);
      if (item.sellPrice3 < 0) throw new Error(`سعر البيع 3 غير صالح في السطر رقم ${index + 1}`);
    }
    if (item.sellPrice4 !== undefined) {
      if (!Number.isFinite(item.sellPrice4)) throw new Error(`سعر البيع 4 ليس رقماً صالحاً في السطر رقم ${index + 1}`);
      if (item.sellPrice4 < 0) throw new Error(`سعر البيع 4 غير صالح في السطر رقم ${index + 1}`);
    }
    
    // منع تكرار نفس المنتج داخل نفس الفاتورة
    if (productIds.has(item.productId)) {
      throw new Error(`المنتج مكرر في السطر رقم ${index + 1}. لا يمكن إضافة نفس المنتج أكثر من مرة في نفس الفاتورة.`);
    }
    productIds.add(item.productId);
  });

  if (params.paidAmount > 0 && !params.cashboxId) {
    throw new Error("يجب اختيار الخزينة عند وجود مبلغ مدفوع.");
  }
};

// ==========================================
// 3. Core Purchase Invoice Service (Atomic)
// ==========================================

export const createPurchaseInvoice = async (params: CreatePurchaseInvoiceParams): Promise<void> => {
  // 1. Validation المبدئي (Sync)
  validateInvoiceInput(params);

  // حساب الإجماليات الأولية بدقة
  let subtotal = 0;
  const processedItems = params.items.map(item => {
    const grossLineTotal = Number((item.quantity * item.purchasePrice).toFixed(4));
    subtotal = Number((subtotal + grossLineTotal).toFixed(4));
    return { ...item, grossLineTotal };
  });

  // معالجة الأخطاء المنطقية للتكاليف
  if (subtotal === 0 && params.additionalCharges > 0) {
    throw new Error("لا يمكن توزيع تكاليف الاقتناء لأن إجمالي تكلفة الأصناف يساوي صفرًا.");
  }
  if (params.discount > subtotal) {
    throw new Error("قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة قبل الخصم.");
  }

  const totalAmount = Number((subtotal - params.discount + params.additionalCharges).toFixed(4));
  
  if (params.paidAmount > totalAmount) {
    throw new Error("المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.");
  }

  // التحقق الدقيق من قواعد طرق الدفع
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

  // توزيع التكاليف بدقة مع معالجة الكسور للمطابقة (Remainder Correction)
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
        // السطر الأخير يأخذ الباقي بالكامل لضمان التطابق الحسابي التام
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

    // الدقة المطلقة: تكلفة الوحدة تحسب بدون أي تقريب مبكر `toFixed` 
    // لضمان (netUnitCost * quantity) === totalCost تماماً في خدمة المخزون
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
      totalCost
    };
  });

  // Final Accounting Validation قبل فتح الـ Transaction
  const calculatedDiscount = invoiceItems.reduce((sum, item) => sum + item.allocatedDiscount, 0);
  const calculatedCharges = invoiceItems.reduce((sum, item) => sum + item.allocatedAcquisitionCharges, 0);
  const calculatedTotalCost = invoiceItems.reduce((sum, item) => sum + item.totalCost, 0);

  const TOLERANCE = 0.0001;
  if (Math.abs(calculatedDiscount - params.discount) > TOLERANCE) {
    throw new Error("خطأ محاسبي: مجموع الخصم الموزع لا يتطابق مع الخصم الإجمالي للفاتورة.");
  }
  if (Math.abs(calculatedCharges - params.additionalCharges) > TOLERANCE) {
    throw new Error("خطأ محاسبي: مجموع تكاليف الاقتناء الموزعة لا يتطابق مع الإجمالي.");
  }
  if (Math.abs(calculatedTotalCost - totalAmount) > TOLERANCE) {
    throw new Error("خطأ محاسبي: إجمالي تكلفة البنود لا يتطابق مع إجمالي الفاتورة.");
  }

  await runTransaction(db, async (transaction: FirestoreTransaction) => {
    // -----------------------------------------------------
    // A. READ / PREPARE PHASE
    // -----------------------------------------------------
    
    // 1. قراءة الفاتورة والتأكد من الـ Idempotency (مقارنة عميقة للبيانات الجوهرية والسطور)
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
          if (!exItem || 
              exItem.productId !== inItem.productId || 
              exItem.quantity !== inItem.quantity || 
              exItem.purchasePrice !== inItem.purchasePrice ||
              exItem.grossLineTotal !== inItem.grossLineTotal ||
              exItem.allocatedDiscount !== inItem.allocatedDiscount ||
              exItem.allocatedAcquisitionCharges !== inItem.allocatedAcquisitionCharges ||
              exItem.netUnitCost !== inItem.netUnitCost ||
              exItem.totalCost !== inItem.totalCost) {
            isSameItems = false;
            break;
          }
        }
      }

      if (isSameBasic && isSameItems) {
        return; // Idempotent Success
      } else {
        throw new Error("معرف الفاتورة مستخدم بالفعل لعملية مختلفة (البيانات لا تتطابق مع الطلب الحالي).");
      }
    }

    // 2. قراءة المورد
    const supplierRef = doc(db, SUPPLIERS_COLLECTION, params.supplierId);
    const supplierSnap = await transaction.get(supplierRef);
    if (!supplierSnap.exists() || (supplierSnap.data() as Supplier).isActive === false) {
      throw new Error("المورد غير موجود أو غير نشط.");
    }

    // 3. قراءة المخزن
    const warehouseRef = doc(db, WAREHOUSES_COLLECTION, params.warehouseId);
    const warehouseSnap = await transaction.get(warehouseRef);
    if (!warehouseSnap.exists() || (warehouseSnap.data() as Warehouse).isActive === false) {
      throw new Error("المخزن غير موجود أو غير نشط.");
    }

    // 4. قراءة الخزينة (إن وجدت)
    let cashboxSnap = null;
    if (params.paidAmount > 0 && params.cashboxId) {
      const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);
      cashboxSnap = await transaction.get(cashboxRef);
      if (!cashboxSnap.exists() || (cashboxSnap.data() as Cashbox).isActive === false) {
        throw new Error("الخزينة المحددة للدفع غير موجودة أو غير نشطة.");
      }
    }

    // 5. قراءات متسلسلة للمنتجات (Product Reads) للتحديثات اللاحقة
    const productRefs = invoiceItems.map(item => doc(db, PRODUCTS_COLLECTION, item.productId));
    const productSnaps = [];
    for (const ref of productRefs) {
      productSnaps.push(await transaction.get(ref));
    }
    productSnaps.forEach((snap, index) => {
      if (!snap.exists() || (snap.data() as Product).isActive === false) {
        throw new Error(`المنتج في السطر رقم ${index + 1} غير موجود أو غير نشط.`);
      }
    });

    // 6. تجهيز حركة الخزينة (إن وجد سداد)
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

    // 7. تجهيز حركة المورد (إن وجد آجل)
    let preparedSupplierTx: PreparedSupplierTransaction | null = null;
    if (remainingAmount > 0) {
      preparedSupplierTx = await prepareSupplierTransactionInTransaction(
        transaction,
        {
          supplierId: params.supplierId,
          type: 'in', // زيادة المديونية
          amount: remainingAmount,
          referenceType: 'purchase_invoice',
          referenceId: params.invoiceId,
          description: `مشتريات آجلة (فاتورة رقم: ${params.invoiceNumber})`,
          createdBy: params.createdBy
        },
        `sup_pur_${params.invoiceId}`
      );
    }

    // 8. تجهيز حركات المخزون لكل المنتجات
    const preparedInventoryTxs: PreparedStockIn[] = [];
    for (const item of invoiceItems) {
      const preparedStockIn = await prepareStockInInTransaction(
        transaction,
        {
          productId: item.productId,
          warehouseId: params.warehouseId,
          quantity: item.quantity,
          unitCost: item.netUnitCost, // الاعتماد الكلي على الصافي التاريخي المحسوب بدقة
          referenceType: 'purchase_invoice',
          referenceId: params.invoiceId,
          sourceLineId: item.lineId,
          description: `شراء ضمن فاتورة رقم: ${params.invoiceNumber}`,
          createdBy: params.createdBy
        }
      );
      preparedInventoryTxs.push(preparedStockIn);
    }

    const now = Timestamp.now();

    // -----------------------------------------------------
    // B. WRITE / COMMIT PHASE
    // -----------------------------------------------------

    // ممنوع عمل أي transaction.get() في هذه المرحلة إطلاقاً لضمان قاعدة Firestore

    // 1. كتابة حركة الخزينة
    if (preparedCashboxTx) {
      commitManualTransactionInTransaction(transaction, preparedCashboxTx);
    }

    // 2. كتابة حركة المورد
    if (preparedSupplierTx) {
      commitSupplierTransactionInTransaction(transaction, preparedSupplierTx);
    }

    // 3. كتابة حركات المخزون والـ WAC
    for (const preparedStock of preparedInventoryTxs) {
      commitStockInInTransaction(transaction, preparedStock);
    }

    // 4. تحديث بيانات المنتجات (lastPurchaseCost وأسعار البيع إن تم تمريرها)
    invoiceItems.forEach((item, index) => {
      const inputItem = params.items.find(i => i.lineId === item.lineId);
      const productUpdateData: Partial<Product> = {
        lastPurchaseCost: item.netUnitCost,
        updatedAt: now as unknown as Date
      };

      if (inputItem?.sellPrice1 !== undefined) productUpdateData.sellPrice1 = inputItem.sellPrice1;
      if (inputItem?.sellPrice2 !== undefined) productUpdateData.sellPrice2 = inputItem.sellPrice2;
      if (inputItem?.sellPrice3 !== undefined) productUpdateData.sellPrice3 = inputItem.sellPrice3;
      if (inputItem?.sellPrice4 !== undefined) productUpdateData.sellPrice4 = inputItem.sellPrice4;

      transaction.update(productRefs[index], productUpdateData);
    });

    // 5. حفظ مستند فاتورة الشراء الرئيسي
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
      updatedAt: now as unknown as Date,
    };

    transaction.set(invoiceRef, invoiceData);
  });
};

// ==========================================
// 4. Public Queries & Helpers
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
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as PurchaseInvoice;
  });
};

export const getPurchaseInvoiceById = async (id: string): Promise<PurchaseInvoice | null> => {
  const invoiceRef = doc(db, INVOICES_COLLECTION, id);
  const snap = await getDoc(invoiceRef);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as PurchaseInvoice;
};
