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
  Cashbox
} from '../types';

// استدعاء الدوال الذرية المجزأة (Prepare / Commit)
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
// Purchase Return Interfaces
// ==========================================

export interface PurchaseReturnItemInput {
  originalLineId: string;
  quantity: number;
}

export interface CreatePurchaseReturnParams {
  returnId: string;
  returnNumber: string;
  originalInvoiceId: string;
  items: PurchaseReturnItemInput[];
  refundedAmount: number;
  cashboxId?: string;
  createdBy: string;
}

// PurchaseInvoiceItem الداخلي مع دعم كمية المرتجع
type PurchaseInvoiceItemWithReturn = PurchaseInvoiceItem & {
  returnedQuantity?: number;
};

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

  if (
    !params.invoiceNumber ||
    params.invoiceNumber.trim() === ''
  ) {
    throw new Error('رقم الفاتورة مطلوب.');
  }

  if (!params.items || params.items.length === 0) {
    throw new Error('الفاتورة لا تحتوي على أصناف.');
  }

  if (!Number.isFinite(params.discount)) {
    throw new Error('قيمة الخصم غير صالحة.');
  }

  if (!Number.isFinite(params.additionalCharges)) {
    throw new Error('قيمة تكاليف الاقتناء غير صالحة.');
  }

  if (!Number.isFinite(params.paidAmount)) {
    throw new Error('قيمة المبلغ المدفوع غير صالحة.');
  }

  if (params.discount < 0) {
    throw new Error('قيمة الخصم لا يمكن أن تكون سالبة.');
  }

  if (params.additionalCharges < 0) {
    throw new Error('تكاليف الاقتناء لا يمكن أن تكون سالبة.');
  }

  if (params.paidAmount < 0) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون سالباً.');
  }

  if (
    !['cash', 'credit', 'partial'].includes(
      params.paymentMethod
    )
  ) {
    throw new Error(
      'طريقة الدفع غير صالحة. يجب أن تكون cash، credit، أو partial.'
    );
  }

  const productIds = new Set<string>();
  const lineIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.lineId) {
      throw new Error(
        `معرف السطر مفقود في الصنف رقم ${index + 1}`
      );
    }

    if (lineIds.has(item.lineId)) {
      throw new Error(
        `معرف السطر مكرر في الصنف رقم ${index + 1}.`
      );
    }

    lineIds.add(item.lineId);

    if (!item.productId) {
      throw new Error(
        `يجب اختيار المنتج في السطر رقم ${index + 1}`
      );
    }

    if (!Number.isFinite(item.quantity)) {
      throw new Error(
        `الكمية ليست رقماً صالحاً في السطر رقم ${index + 1}`
      );
    }

    if (item.quantity <= 0) {
      throw new Error(
        `الكمية غير صالحة في السطر رقم ${index + 1}`
      );
    }

    if (!Number.isFinite(item.purchasePrice)) {
      throw new Error(
        `سعر الشراء ليس رقماً صالحاً في السطر رقم ${index + 1}`
      );
    }

    if (item.purchasePrice < 0) {
      throw new Error(
        `سعر الشراء غير صالح في السطر رقم ${index + 1}`
      );
    }

    if (item.sellPrice1 !== undefined) {
      if (!Number.isFinite(item.sellPrice1)) {
        throw new Error(
          `سعر البيع 1 ليس رقماً صالحاً في السطر رقم ${index + 1}`
        );
      }

      if (item.sellPrice1 < 0) {
        throw new Error(
          `سعر البيع 1 غير صالح في السطر رقم ${index + 1}`
        );
      }
    }

    if (item.sellPrice2 !== undefined) {
      if (!Number.isFinite(item.sellPrice2)) {
        throw new Error(
          `سعر البيع 2 ليس رقماً صالحاً في السطر رقم ${index + 1}`
        );
      }

      if (item.sellPrice2 < 0) {
        throw new Error(
          `سعر البيع 2 غير صالح في السطر رقم ${index + 1}`
        );
      }
    }

    if (item.sellPrice3 !== undefined) {
      if (!Number.isFinite(item.sellPrice3)) {
        throw new Error(
          `سعر البيع 3 ليس رقماً صالحاً في السطر رقم ${index + 1}`
        );
      }

      if (item.sellPrice3 < 0) {
        throw new Error(
          `سعر البيع 3 غير صالح في السطر رقم ${index + 1}`
        );
      }
    }

    if (item.sellPrice4 !== undefined) {
      if (!Number.isFinite(item.sellPrice4)) {
        throw new Error(
          `سعر البيع 4 ليس رقماً صالحاً في السطر رقم ${index + 1}`
        );
      }

      if (item.sellPrice4 < 0) {
        throw new Error(
          `سعر البيع 4 غير صالح في السطر رقم ${index + 1}`
        );
      }
    }

    if (productIds.has(item.productId)) {
      throw new Error(
        `المنتج مكرر في السطر رقم ${index + 1}. لا يمكن إضافة نفس المنتج أكثر من مرة في نفس الفاتورة.`
      );
    }

    productIds.add(item.productId);
  });

  if (params.paidAmount > 0 && !params.cashboxId) {
    throw new Error(
      'يجب اختيار الخزينة عند وجود مبلغ مدفوع.'
    );
  }
};

// ==========================================
// Purchase Return Validation
// ==========================================

const validatePurchaseReturnInput = (
  params: CreatePurchaseReturnParams
) => {
  if (!params.returnId) {
    throw new Error('معرف المرتجع (Return ID) مفقود.');
  }

  if (
    !params.returnNumber ||
    params.returnNumber.trim() === ''
  ) {
    throw new Error('رقم المرتجع مطلوب.');
  }

  if (!params.originalInvoiceId) {
    throw new Error('معرف فاتورة الشراء الأصلية مفقود.');
  }

  if (!params.items || params.items.length === 0) {
    throw new Error('المرتجع لا يحتوي على أصناف.');
  }

  if (!Number.isFinite(params.refundedAmount)) {
    throw new Error('قيمة المبلغ المسترد غير صالحة.');
  }

  if (params.refundedAmount < 0) {
    throw new Error(
      'المبلغ المسترد لا يمكن أن يكون سالباً.'
    );
  }

  if (params.refundedAmount > 0 && !params.cashboxId) {
    throw new Error(
      'يجب اختيار الخزينة عند وجود مبلغ مسترد نقداً.'
    );
  }

  const originalLineIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.originalLineId) {
      throw new Error(
        `معرف السطر الأصلي مفقود في السطر رقم ${index + 1}.`
      );
    }

    if (originalLineIds.has(item.originalLineId)) {
      throw new Error(
        `السطر الأصلي مكرر في المرتجع: ${item.originalLineId}`
      );
    }

    originalLineIds.add(item.originalLineId);

    if (!Number.isFinite(item.quantity)) {
      throw new Error(
        `كمية المرتجع غير صالحة في السطر رقم ${index + 1}.`
      );
    }

    if (item.quantity <= 0) {
      throw new Error(
        `كمية المرتجع يجب أن تكون أكبر من صفر في السطر رقم ${index + 1}.`
      );
    }
  });
};

// ==========================================
// Date Helper
// ==========================================

const toDateSafe = (value: unknown): Date => {
  if (!value) return new Date();

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
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
    const grossLineTotal = Number(
      (item.quantity * item.purchasePrice).toFixed(4)
    );

    subtotal = Number(
      (subtotal + grossLineTotal).toFixed(4)
    );

    return {
      ...item,
      grossLineTotal
    };
  });

  if (subtotal === 0 && params.additionalCharges > 0) {
    throw new Error(
      'لا يمكن توزيع تكاليف الاقتناء لأن إجمالي تكلفة الأصناف يساوي صفرًا.'
    );
  }

  if (params.discount > subtotal) {
    throw new Error(
      'قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة قبل الخصم.'
    );
  }

  const totalAmount = Number(
    (
      subtotal -
      params.discount +
      params.additionalCharges
    ).toFixed(4)
  );

  if (params.paidAmount > totalAmount) {
    throw new Error(
      'المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.'
    );
  }

  if (
    params.paymentMethod === 'cash' &&
    params.paidAmount !== totalAmount
  ) {
    throw new Error(
      "طريقة الدفع 'نقدي' تتطلب دفع إجمالي الفاتورة بالكامل."
    );
  }

  if (
    params.paymentMethod === 'credit' &&
    params.paidAmount !== 0
  ) {
    throw new Error(
      "طريقة الدفع 'آجل' تتطلب أن يكون المبلغ المدفوع صفراً."
    );
  }

  if (
    params.paymentMethod === 'partial' &&
    (
      params.paidAmount <= 0 ||
      params.paidAmount >= totalAmount
    )
  ) {
    throw new Error(
      "طريقة الدفع 'جزئي' تتطلب دفع مبلغ أكبر من صفر وأقل من الإجمالي."
    );
  }

  const remainingAmount = Number(
    (totalAmount - params.paidAmount).toFixed(4)
  );

  let remainingDiscountToAllocate = params.discount;
  let remainingChargesToAllocate =
    params.additionalCharges;
  let remainingTotalAmount = totalAmount;

  const invoiceItems: PurchaseInvoiceItem[] =
    processedItems.map((item, index) => {
      const isLastItem =
        index === processedItems.length - 1;

      let allocatedDiscount = 0;
      let allocatedAcquisitionCharges = 0;
      let totalCost = 0;

      if (subtotal > 0) {
        if (isLastItem) {
          allocatedDiscount =
            remainingDiscountToAllocate;

          allocatedAcquisitionCharges =
            remainingChargesToAllocate;

          totalCost = remainingTotalAmount;
        } else {
          const ratio =
            item.grossLineTotal / subtotal;

          allocatedDiscount = Number(
            (params.discount * ratio).toFixed(4)
          );

          remainingDiscountToAllocate = Number(
            (
              remainingDiscountToAllocate -
              allocatedDiscount
            ).toFixed(4)
          );

          allocatedAcquisitionCharges = Number(
            (
              params.additionalCharges * ratio
            ).toFixed(4)
          );

          remainingChargesToAllocate = Number(
            (
              remainingChargesToAllocate -
              allocatedAcquisitionCharges
            ).toFixed(4)
          );

          totalCost = Number(
            (
              item.grossLineTotal -
              allocatedDiscount +
              allocatedAcquisitionCharges
            ).toFixed(4)
          );

          remainingTotalAmount = Number(
            (
              remainingTotalAmount -
              totalCost
            ).toFixed(4)
          );
        }
      }

      const netUnitCost =
        item.quantity > 0
          ? totalCost / item.quantity
          : 0;

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

  const calculatedDiscount =
    invoiceItems.reduce(
      (sum, item) =>
        sum + item.allocatedDiscount,
      0
    );

  const calculatedCharges =
    invoiceItems.reduce(
      (sum, item) =>
        sum + item.allocatedAcquisitionCharges,
      0
    );

  const calculatedTotalCost =
    invoiceItems.reduce(
      (sum, item) =>
        sum + item.totalCost,
      0
    );

  if (
    Math.abs(
      calculatedDiscount - params.discount
    ) > TOLERANCE
  ) {
    throw new Error(
      'خطأ محاسبي: مجموع الخصم الموزع لا يتطابق مع الخصم الإجمالي للفاتورة.'
    );
  }

  if (
    Math.abs(
      calculatedCharges -
      params.additionalCharges
    ) > TOLERANCE
  ) {
    throw new Error(
      'خطأ محاسبي: مجموع تكاليف الاقتناء الموزعة لا يتطابق مع الإجمالي.'
    );
  }

  if (
    Math.abs(
      calculatedTotalCost - totalAmount
    ) > TOLERANCE
  ) {
    throw new Error(
      'خطأ محاسبي: إجمالي تكلفة البنود لا يتطابق مع إجمالي الفاتورة.'
    );
  }

  await runTransaction(
    db,
    async (
      transaction: FirestoreTransaction
    ) => {
      // ======================================
      // A. READ / PREPARE PHASE
      // ======================================

      const invoiceRef = doc(
        db,
        INVOICES_COLLECTION,
        params.invoiceId
      );

      const invoiceSnap =
        await transaction.get(invoiceRef);

      if (invoiceSnap.exists()) {
        const existingData =
          invoiceSnap.data() as PurchaseInvoice;

        const isSameBasic =
          existingData.supplierId ===
            params.supplierId &&
          existingData.warehouseId ===
            params.warehouseId &&
          existingData.invoiceNumber ===
            params.invoiceNumber &&
          existingData.subtotal === subtotal &&
          existingData.discount ===
            params.discount &&
          existingData.additionalCharges ===
            params.additionalCharges &&
          existingData.totalAmount ===
            totalAmount &&
          existingData.paidAmount ===
            params.paidAmount &&
          existingData.remainingAmount ===
            remainingAmount &&
          existingData.paymentMethod ===
            params.paymentMethod &&
          existingData.cashboxId ===
            params.cashboxId &&
          existingData.items.length ===
            invoiceItems.length;

        let isSameItems = true;

        if (isSameBasic) {
          for (const inItem of invoiceItems) {
            const exItem =
              existingData.items.find(
                e =>
                  e.lineId ===
                  inItem.lineId
              );

            if (
              !exItem ||
              exItem.productId !==
                inItem.productId ||
              exItem.quantity !==
                inItem.quantity ||
              exItem.purchasePrice !==
                inItem.purchasePrice ||
              exItem.grossLineTotal !==
                inItem.grossLineTotal ||
              exItem.allocatedDiscount !==
                inItem.allocatedDiscount ||
              exItem.allocatedAcquisitionCharges !==
                inItem.allocatedAcquisitionCharges ||
              exItem.netUnitCost !==
                inItem.netUnitCost ||
              exItem.totalCost !==
                inItem.totalCost
            ) {
              isSameItems = false;
              break;
            }
          }
        }

        if (isSameBasic && isSameItems) {
          return;
        }

        throw new Error(
          'معرف الفاتورة مستخدم بالفعل لعملية مختلفة (البيانات لا تتطابق مع الطلب الحالي).'
        );
      }

      const supplierRef = doc(
        db,
        SUPPLIERS_COLLECTION,
        params.supplierId
      );

      const supplierSnap =
        await transaction.get(
          supplierRef
        );

      if (
        !supplierSnap.exists() ||
        (supplierSnap.data() as Supplier)
          .isActive === false
      ) {
        throw new Error(
          'المورد غير موجود أو غير نشط.'
        );
      }

      const warehouseRef = doc(
        db,
        WAREHOUSES_COLLECTION,
        params.warehouseId
      );

      const warehouseSnap =
        await transaction.get(
          warehouseRef
        );

      if (
        !warehouseSnap.exists() ||
        (warehouseSnap.data() as Warehouse)
          .isActive === false
      ) {
        throw new Error(
          'المخزن غير موجود أو غير نشط.'
        );
      }

      let cashboxSnap = null;

      if (
        params.paidAmount > 0 &&
        params.cashboxId
      ) {
        const cashboxRef = doc(
          db,
          CASHBOXES_COLLECTION,
          params.cashboxId
        );

        cashboxSnap =
          await transaction.get(
            cashboxRef
          );

        if (
          !cashboxSnap.exists() ||
          (cashboxSnap.data() as Cashbox)
            .isActive === false
        ) {
          throw new Error(
            'الخزينة المحددة للدفع غير موجودة أو غير نشطة.'
          );
        }
      }

      const productRefs =
        invoiceItems.map(item =>
          doc(
            db,
            PRODUCTS_COLLECTION,
            item.productId
          )
        );

      const productSnaps = [];

      for (const ref of productRefs) {
        productSnaps.push(
          await transaction.get(ref)
        );
      }

      productSnaps.forEach(
        (snap, index) => {
          if (
            !snap.exists() ||
            (snap.data() as Product)
              .isActive === false
          ) {
            throw new Error(
              `المنتج في السطر رقم ${
                index + 1
              } غير موجود أو غير نشط.`
            );
          }
        }
      );

      let preparedCashboxTx:
        | PreparedManualTransaction
        | null = null;

      if (
        params.paidAmount > 0 &&
        params.cashboxId
      ) {
        preparedCashboxTx =
          await prepareManualTransactionInTransaction(
            transaction,
            {
              cashboxId:
                params.cashboxId,
              type: 'out',
              amount:
                params.paidAmount,
              referenceType:
                'purchase_invoice',
              referenceId:
                params.invoiceId,
              description:
                `سداد فاتورة مشتريات (رقم: ${params.invoiceNumber})`,
              createdBy:
                params.createdBy
            },
            `cash_pur_${params.invoiceId}`
          );
      }

      let preparedSupplierTx:
        | PreparedSupplierTransaction
        | null = null;

      if (remainingAmount > 0) {
        preparedSupplierTx =
          await prepareSupplierTransactionInTransaction(
            transaction,
            {
              supplierId:
                params.supplierId,
              type: 'in',
              amount:
                remainingAmount,
              referenceType:
                'purchase_invoice',
              referenceId:
                params.invoiceId,
              description:
                `مشتريات آجلة (فاتورة رقم: ${params.invoiceNumber})`,
              createdBy:
                params.createdBy
            },
            `sup_pur_${params.invoiceId}`
          );
      }

      const preparedInventoryTxs:
        PreparedStockIn[] = [];

      for (const item of invoiceItems) {
        const preparedStockIn =
          await prepareStockInInTransaction(
            transaction,
            {
              productId:
                item.productId,
              warehouseId:
                params.warehouseId,
              quantity:
                item.quantity,
              unitCost:
                item.netUnitCost,
              referenceType:
                'purchase_invoice',
              referenceId:
                params.invoiceId,
              sourceLineId:
                item.lineId,
              description:
                `شراء ضمن فاتورة رقم: ${params.invoiceNumber}`,
              createdBy:
                params.createdBy
            }
          );

        preparedInventoryTxs.push(
          preparedStockIn
        );
      }

      const now = Timestamp.now();

      // ======================================
      // B. WRITE / COMMIT PHASE
      // ======================================

      if (preparedCashboxTx) {
        commitManualTransactionInTransaction(
          transaction,
          preparedCashboxTx
        );
      }

      if (preparedSupplierTx) {
        commitSupplierTransactionInTransaction(
          transaction,
          preparedSupplierTx
        );
      }

      for (const preparedStock of preparedInventoryTxs) {
        commitStockInInTransaction(
          transaction,
          preparedStock
        );
      }

      invoiceItems.forEach(
        (item, index) => {
          const inputItem =
            params.items.find(
              i =>
                i.lineId ===
                item.lineId
            );

          const productUpdateData:
            Partial<Product> = {
            lastPurchaseCost:
              item.netUnitCost,
            updatedAt:
              now as unknown as Date
          };

          if (
            inputItem?.sellPrice1 !==
            undefined
          ) {
            productUpdateData.sellPrice1 =
              inputItem.sellPrice1;
          }

          if (
            inputItem?.sellPrice2 !==
            undefined
          ) {
            productUpdateData.sellPrice2 =
              inputItem.sellPrice2;
          }

          if (
            inputItem?.sellPrice3 !==
            undefined
          ) {
            productUpdateData.sellPrice3 =
              inputItem.sellPrice3;
          }

          if (
            inputItem?.sellPrice4 !==
            undefined
          ) {
            productUpdateData.sellPrice4 =
              inputItem.sellPrice4;
          }

          transaction.update(
            productRefs[index],
            productUpdateData
          );
        }
      );

      const invoiceData:
        Omit<PurchaseInvoice, 'id'> = {
        invoiceNumber:
          params.invoiceNumber,
        supplierId:
          params.supplierId,
        warehouseId:
          params.warehouseId,
        items:
          invoiceItems,
        subtotal,
        discount:
          params.discount,
        additionalCharges:
          params.additionalCharges,
        totalAmount,
        paidAmount:
          params.paidAmount,
        remainingAmount,
        paymentMethod:
          params.paymentMethod,
        cashboxId:
          params.paidAmount > 0
            ? params.cashboxId
            : undefined,
        status: 'completed',
        createdBy:
          params.createdBy,
        createdAt:
          now as unknown as Date,
        updatedAt:
          now as unknown as Date
      };

      transaction.set(
        invoiceRef,
        invoiceData
      );
    }
  );
};

// ==========================================
// 4. Purchase Return Service (Atomic)
// ==========================================

export const createPurchaseReturn = async (
  params: CreatePurchaseReturnParams
): Promise<void> => {
  validatePurchaseReturnInput(params);

  await runTransaction(
    db,
    async (
      transaction: FirestoreTransaction
    ) => {
      // ======================================
      // A. READ / PREPARE PHASE
      // ======================================

      const returnRef = doc(
        db,
        PURCHASE_RETURNS_COLLECTION,
        params.returnId
      );

      const returnSnap =
        await transaction.get(returnRef);

      // --------------------------------------
      // Idempotency
      // --------------------------------------

      if (returnSnap.exists()) {
        const existing =
          returnSnap.data() as PurchaseReturn;

        const existingItems =
          existing.items || [];

        if (
          existing.returnNumber !==
            params.returnNumber ||
          existing.originalPurchaseInvoiceId !==
            params.originalInvoiceId ||
          existing.refundedAmount !==
            Number(
              params.refundedAmount.toFixed(
                4
              )
            ) ||
          existing.cashboxId !==
            params.cashboxId ||
          existingItems.length !==
            params.items.length
        ) {
          throw new Error(
            'معرف المرتجع مستخدم بالفعل لعملية مختلفة (البيانات لا تتطابق مع الطلب الحالي).'
          );
        }

        for (
          const inputItem of params.items
        ) {
          const existingItem =
            existingItems.find(
              item =>
                item.originalLineId ===
                inputItem.originalLineId
            );

          if (
            !existingItem ||
            existingItem.quantity !==
              inputItem.quantity
          ) {
            throw new Error(
              'معرف المرتجع مستخدم بالفعل لعملية مختلفة (تفاصيل الأصناف لا تتطابق).'
            );
          }
        }

        return;
      }

      // --------------------------------------
      // Original Purchase Invoice
      // --------------------------------------

      const invoiceRef = doc(
        db,
        INVOICES_COLLECTION,
        params.originalInvoiceId
      );

      const invoiceSnap =
        await transaction.get(
          invoiceRef
        );

      if (!invoiceSnap.exists()) {
        throw new Error(
          'فاتورة المشتريات الأصلية غير موجودة.'
        );
      }

      const originalInvoice =
        invoiceSnap.data() as PurchaseInvoice;

      if (
        originalInvoice.status ===
        'cancelled'
      ) {
        throw new Error(
          'لا يمكن عمل مرتجع على فاتورة ملغاة.'
        );
      }

      if (
        originalInvoice.status ===
        'fully_returned'
      ) {
        throw new Error(
          'لا يمكن عمل مرتجع على فاتورة مرتجعة بالكامل.'
        );
      }

      if (
        !originalInvoice.items ||
        originalInvoice.items.length === 0
      ) {
        throw new Error(
          'فاتورة المشتريات الأصلية لا تحتوي على أصناف.'
        );
      }

      // --------------------------------------
      // Supplier
      // --------------------------------------

      const supplierRef = doc(
        db,
        SUPPLIERS_COLLECTION,
        originalInvoice.supplierId
      );

      const supplierSnap =
        await transaction.get(
          supplierRef
        );

      if (
        !supplierSnap.exists() ||
        (supplierSnap.data() as Supplier)
          .isActive === false
      ) {
        throw new Error(
          'المورد المرتبط بالفاتورة غير موجود أو غير نشط.'
        );
      }

      // --------------------------------------
      // Warehouse
      // --------------------------------------

      const warehouseRef = doc(
        db,
        WAREHOUSES_COLLECTION,
        originalInvoice.warehouseId
      );

      const warehouseSnap =
        await transaction.get(
          warehouseRef
        );

      if (
        !warehouseSnap.exists() ||
        (warehouseSnap.data() as Warehouse)
          .isActive === false
      ) {
        throw new Error(
          'المخزن المرتبط بالفاتورة غير موجود أو غير نشط.'
        );
      }

      // --------------------------------------
      // Cashbox
      // --------------------------------------

      let cashboxSnap = null;

      if (
        params.refundedAmount > 0 &&
        params.cashboxId
      ) {
        const cashboxRef = doc(
          db,
          CASHBOXES_COLLECTION,
          params.cashboxId
        );

        cashboxSnap =
          await transaction.get(
            cashboxRef
          );

        if (
          !cashboxSnap.exists() ||
          (cashboxSnap.data() as Cashbox)
            .isActive === false
        ) {
          throw new Error(
            'الخزينة المحددة للاسترداد غير موجودة أو غير نشطة.'
          );
        }
      }

      // --------------------------------------
      // Validate Return Lines
      // --------------------------------------

      const originalItems =
        originalInvoice.items as PurchaseInvoiceItemWithReturn[];

      const updatedItems:
        PurchaseInvoiceItemWithReturn[] =
        originalItems.map(item => ({
          ...item,
          returnedQuantity:
            Number.isFinite(
              item.returnedQuantity
            )
              ? item.returnedQuantity
              : 0
        }));

      const returnItems:
        PurchaseReturnItem[] = [];

      let totalReturnAmount = 0;

      for (
        const inputItem of params.items
      ) {
        const originalItem =
          updatedItems.find(
            item =>
              item.lineId ===
              inputItem.originalLineId
          );

        if (!originalItem) {
          throw new Error(
            `السطر الأصلي غير موجود في الفاتورة: ${inputItem.originalLineId}`
          );
        }

        if (
          !Number.isFinite(
            originalItem.returnedQuantity
          ) ||
          (originalItem.returnedQuantity ?? 0) <
            0
        ) {
          throw new Error(
            `كمية المرتجع السابقة غير صالحة للسطر: ${inputItem.originalLineId}`
          );
        }

        if (
          (originalItem.returnedQuantity ?? 0) >
          originalItem.quantity +
            TOLERANCE
        ) {
          throw new Error(
            `كمية المرتجع السابقة تتجاوز كمية الفاتورة للسطر: ${inputItem.originalLineId}`
          );
        }

        const remainingQuantity =
          Number(
            (
              originalItem.quantity -
              (originalItem.returnedQuantity ??
                0)
            ).toFixed(4)
          );

        if (
          inputItem.quantity >
          remainingQuantity +
            TOLERANCE
        ) {
          throw new Error(
            `الكمية المرتجعة للسطر ${inputItem.originalLineId} تتجاوز الكمية المتبقية. المتبقي: ${remainingQuantity}`
          );
        }

        if (
          !Number.isFinite(
            originalItem.netUnitCost
          ) ||
          originalItem.netUnitCost < 0
        ) {
          throw new Error(
            `التكلفة التاريخية للسطر ${inputItem.originalLineId} غير صالحة.`
          );
        }

        const totalAmount = Number(
          (
            inputItem.quantity *
            originalItem.netUnitCost
          ).toFixed(4)
        );

        const newReturnedQuantity =
          Number(
            (
              (originalItem.returnedQuantity ??
                0) +
              inputItem.quantity
            ).toFixed(4)
          );

        originalItem.returnedQuantity =
          newReturnedQuantity;

        totalReturnAmount = Number(
          (
            totalReturnAmount +
            totalAmount
          ).toFixed(4)
        );

        // ID deterministic وليس Math.random()
        const deterministicLineId =
          `retline_${params.returnId}_${inputItem.originalLineId}`;

        returnItems.push({
          lineId:
            deterministicLineId,
          originalLineId:
            inputItem.originalLineId,
          productId:
            originalItem.productId,
          quantity:
            inputItem.quantity,
          returnPrice:
            originalItem.netUnitCost,
          totalAmount
        });
      }

      if (
        totalReturnAmount <=
        TOLERANCE
      ) {
        throw new Error(
          'قيمة المرتجع يجب أن تكون أكبر من صفر.'
        );
      }

      if (
        params.refundedAmount >
        totalReturnAmount +
          TOLERANCE
      ) {
        throw new Error(
          'المبلغ المسترد نقداً لا يمكن أن يتجاوز قيمة المرتجع.'
        );
      }

      const normalizedRefundedAmount =
        Number(
          params.refundedAmount.toFixed(
            4
          )
        );

      const normalizedTotalReturnAmount =
        Number(
          totalReturnAmount.toFixed(4)
        );

      // الجزء الذي سيصبح رصيداً لنا عند المورد
      const supplierCreditAmount =
        Number(
          (
            normalizedTotalReturnAmount -
            normalizedRefundedAmount
          ).toFixed(4)
        );

      if (
        supplierCreditAmount <
        -TOLERANCE
      ) {
        throw new Error(
          'خطأ محاسبي: قيمة رصيد المورد الناتج عن المرتجع غير صحيحة.'
        );
      }

      // --------------------------------------
      // Determine Invoice Status
      // --------------------------------------

      const allReturned =
        updatedItems.every(item => {
          const returnedQuantity =
            item.returnedQuantity ?? 0;

          return (
            returnedQuantity >=
            item.quantity -
              TOLERANCE
          );
        });

      const newInvoiceStatus =
        allReturned
          ? 'fully_returned'
          : 'partially_returned';

      // --------------------------------------
      // Prepare Cashbox Transaction
      // --------------------------------------

      let preparedCashboxTx:
        | PreparedManualTransaction
        | null = null;

      if (
        normalizedRefundedAmount >
        TOLERANCE
      ) {
        preparedCashboxTx =
          await prepareManualTransactionInTransaction(
            transaction,
            {
              cashboxId:
                params.cashboxId!,
              type: 'in',
              amount:
                normalizedRefundedAmount,
              referenceType:
                'purchase_return',
              referenceId:
                params.returnId,
              description:
                `استرداد نقدي من المورد عن مرتجع رقم: ${params.returnNumber}`,
              createdBy:
                params.createdBy
            },
            `cash_pur_return_${params.returnId}`
          );
      }

      // --------------------------------------
      // Prepare Supplier Transaction
      // Only the non-refunded part affects
      // supplier balance.
      // --------------------------------------

      let preparedSupplierTx:
        | PreparedSupplierTransaction
        | null = null;

      if (
        supplierCreditAmount >
        TOLERANCE
      ) {
        preparedSupplierTx =
          await prepareSupplierTransactionInTransaction(
            transaction,
            {
              supplierId:
                originalInvoice.supplierId,
              type: 'out',
              amount:
                supplierCreditAmount,
              referenceType:
                'purchase_return',
              referenceId:
                params.returnId,
              description:
                `رصيد دائن للمشتري بسبب مرتجع رقم: ${params.returnNumber}`,
              createdBy:
                params.createdBy
            },
            `sup_pur_return_${params.returnId}`
          );
      }

      // --------------------------------------
      // Prepare Inventory Stock Out
      // --------------------------------------

      const preparedInventoryTxs:
        PreparedStockOut[] = [];

      for (
        const returnItem of returnItems
      ) {
        const preparedStockOut =
          await prepareStockOutInTransaction(
            transaction,
            {
              productId:
                returnItem.productId,
              warehouseId:
                originalInvoice.warehouseId,
              quantity:
                returnItem.quantity,
              referenceType:
                'purchase_return',
              referenceId:
                params.returnId,
              sourceLineId:
                returnItem.originalLineId,
              description:
                `مرتجع مشتريات رقم: ${params.returnNumber}`,
              createdBy:
                params.createdBy
            }
          );

        preparedInventoryTxs.push(
          preparedStockOut
        );
      }

      const now = Timestamp.now();

      // ======================================
      // B. WRITE / COMMIT PHASE
      // ======================================

      if (preparedCashboxTx) {
        commitManualTransactionInTransaction(
          transaction,
          preparedCashboxTx
        );
      }

      if (preparedSupplierTx) {
        commitSupplierTransactionInTransaction(
          transaction,
          preparedSupplierTx
        );
      }

      for (
        const preparedStock of
          preparedInventoryTxs
      ) {
        commitStockOutInTransaction(
          transaction,
          preparedStock
        );
      }

      // --------------------------------------
      // Update Original Purchase Invoice
      // --------------------------------------

      transaction.update(
        invoiceRef,
        {
          items:
            updatedItems,
          status:
            newInvoiceStatus,
          updatedAt:
            now as unknown as Date
        }
      );

      // --------------------------------------
      // Save Purchase Return
      // --------------------------------------

      const returnData:
        Omit<PurchaseReturn, 'id'> = {
        returnNumber:
          params.returnNumber,
        originalPurchaseInvoiceId:
          params.originalInvoiceId,
        supplierId:
          originalInvoice.supplierId,
        warehouseId:
          originalInvoice.warehouseId,
        items:
          returnItems,
        totalAmount:
          normalizedTotalReturnAmount,
        refundedAmount:
          normalizedRefundedAmount,
        supplierCreditAmount:
          Math.max(
            0,
            supplierCreditAmount
          ),
        cashboxId:
          normalizedRefundedAmount >
          TOLERANCE
            ? params.cashboxId
            : undefined,
        status:
          'completed',
        createdBy:
          params.createdBy,
        createdAt:
          now as unknown as Date,
        updatedAt:
          now as unknown as Date
      };

      transaction.set(
        returnRef,
        returnData
      );
    }
  );
};

// ==========================================
// 5. Public Queries & Helpers
// ==========================================

export const getPurchaseInvoices =
  async (): Promise<PurchaseInvoice[]> => {
    const q = query(
      collection(
        db,
        INVOICES_COLLECTION
      ),
      orderBy(
        'createdAt',
        'desc'
      )
    );

    const snapshot =
      await getDocs(q);

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

export const getPurchaseInvoiceById =
  async (
    id: string
  ): Promise<PurchaseInvoice | null> => {
    const invoiceRef = doc(
      db,
      INVOICES_COLLECTION,
      id
    );

    const snap =
      await getDoc(invoiceRef);

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

// ==========================================
// Purchase Return Queries
// ==========================================

export const getPurchaseReturns =
  async (): Promise<PurchaseReturn[]> => {
    const q = query(
      collection(
        db,
        PURCHASE_RETURNS_COLLECTION
      ),
      orderBy(
        'createdAt',
        'desc'
      )
    );

    const snapshot =
      await getDocs(q);

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

export const getPurchaseReturnById =
  async (
    id: string
  ): Promise<PurchaseReturn | null> => {
    const returnRef = doc(
      db,
      PURCHASE_RETURNS_COLLECTION,
      id
    );

    const snap =
      await getDoc(returnRef);

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
