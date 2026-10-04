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
  PurchaseReturn,
  PurchaseReturnItem,
  Product,
  Warehouse,
  Supplier,
  Cashbox,
  InventoryItem,
  InventoryLayerTracker,
  PurchaseInvoice,
  SupplierTransaction,
  CashboxTransaction,
  InventoryMovement
} from '../types';

import {
  prepareStockOutInTransaction,
  commitStockOutInTransaction,
  PreparedStockOut
} from './inventoryService';

import {
  prepareSupplierTransactionInTransaction,
  commitSupplierTransactionInTransaction
} from './supplierService';

import {
  prepareManualTransactionInTransaction,
  commitManualTransactionInTransaction,
  PreparedManualTransaction
} from './transactionService';

const PURCHASE_RETURNS_COLLECTION = 'purchase_returns';
const INVOICES_COLLECTION = 'purchase_invoices';
const PRODUCTS_COLLECTION = 'products';
const WAREHOUSES_COLLECTION = 'warehouses';
const SUPPLIERS_COLLECTION = 'suppliers';
const CASHBOXES_COLLECTION = 'cashboxes';
const INVENTORY_COLLECTION = 'inventory_items';
const INVENTORY_LAYERS_COLLECTION = 'inventory_layers';
const SUPPLIER_TX_COLLECTION = 'supplier_transactions';
const CASHBOX_TX_COLLECTION = 'cashbox_transactions';
const MOVEMENTS_COLLECTION = 'inventory_movements';

const TOLERANCE = 0.0001;

// ==========================================
// 1. Interfaces
// ==========================================

export interface PurchaseReturnItemInput {
  lineId: string;
  productId: string;
  quantity: number;
  returnPrice?: number;
}

export interface CreatePurchaseReturnParams {
  returnId?: string;
  returnNumber?: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseReturnItemInput[];
  refundMethod: 'cash' | 'supplier_credit';
  cashboxId?: string;
  createdBy: string;
}

// ==========================================
// 2. Validation & Helpers
// ==========================================

const toDateSafe = (value: unknown): Date => {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
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
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const validatePurchaseReturnInput = (
  params: CreatePurchaseReturnParams
) => {
  if (!params.supplierId) {
    throw new Error('معرف المورد مطلوب.');
  }

  if (!params.warehouseId) {
    throw new Error('معرف المخزن مطلوب.');
  }

  if (!params.items || params.items.length === 0) {
    throw new Error('المرتجع لا يحتوي على أصناف.');
  }

  if (params.refundMethod === 'cash' && !params.cashboxId) {
    throw new Error('يجب اختيار الخزينة عند تحديد طريقة الاسترداد النقدي.');
  }

  const productIds = new Set<string>();
  const lineIds = new Set<string>();

  params.items.forEach((item, index) => {
    if (!item.lineId) {
      throw new Error(`معرف السطر مفقود في الصنف رقم ${index + 1}.`);
    }

    if (lineIds.has(item.lineId)) {
      throw new Error(`معرف السطر مكرر في المرتجع: ${item.lineId}`);
    }
    lineIds.add(item.lineId);

    if (!item.productId) {
      throw new Error(`معرف المنتج مفقود في السطر رقم ${index + 1}.`);
    }

    if (productIds.has(item.productId)) {
      throw new Error(
        'المنتج مكرر في المرتجع. لا يمكن إرجاع نفس المنتج أكثر من مرة في نفس العملية.'
      );
    }
    productIds.add(item.productId);

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(
        `الكمية غير صالحة في السطر رقم ${index + 1}. يجب أن تكون أكبر من صفر.`
      );
    }

    if (
      item.returnPrice !== undefined &&
      (!Number.isFinite(item.returnPrice) || item.returnPrice < 0)
    ) {
      throw new Error(`سعر المرتجع غير صالح في السطر رقم ${index + 1}.`);
    }
  });
};

// ==========================================
// 3. Core Purchase Return Service (Atomic)
// ==========================================

export const createPurchaseReturn = async (
  params: CreatePurchaseReturnParams
): Promise<void> => {
  validatePurchaseReturnInput(params);

  // Deterministic IDs (Generated BEFORE Transaction if not provided)
  const returnId =
    params.returnId || doc(collection(db, PURCHASE_RETURNS_COLLECTION)).id;
  const returnNumber =
    params.returnNumber ||
    `PRET-${returnId.substring(0, 8).toUpperCase()}`;

  await runTransaction(db, async (transaction: FirestoreTransaction) => {
    // ======================================
    // A. READ PHASE 1: Idempotency & Partial State Check
    // ======================================

    const returnRef = doc(
      db,
      PURCHASE_RETURNS_COLLECTION,
      returnId
    );
    const returnSnap = await transaction.get(returnRef);

    const supTxRef = doc(
      db,
      SUPPLIER_TX_COLLECTION,
      `sup_tx_ret_${returnId}`
    );
    const cashTxRef = doc(
      db,
      CASHBOX_TX_COLLECTION,
      `cash_tx_ret_${returnId}`
    );

    const movementRefs = params.items.map((item) =>
      doc(
        db,
        MOVEMENTS_COLLECTION,
        `mov_purchase_return_${returnId}_${item.lineId}_out`
      )
    );

    const supTxSnap = await transaction.get(supTxRef);
    const cashTxSnap = await transaction.get(cashTxRef);
    const movementSnaps = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref))
    );

    const expectsCashTx = params.refundMethod === 'cash';

    // Strict Idempotency Validation (Execute BEFORE checking inventory or WAC)
    if (returnSnap.exists()) {
      const existingData = returnSnap.data() as PurchaseReturn;

      // Validate core data match
      let isMatch =
        existingData.supplierId === params.supplierId &&
        existingData.warehouseId === params.warehouseId &&
        existingData.items.length === params.items.length;

      if (expectsCashTx) {
        if (
          existingData.cashboxId !== params.cashboxId ||
          existingData.refundedAmount !== existingData.totalAmount
        ) {
          isMatch = false;
        }
      } else {
        if (
          existingData.cashboxId !== undefined ||
          existingData.supplierCreditAmount !== existingData.totalAmount
        ) {
          isMatch = false;
        }
      }

      if (isMatch) {
        for (const inputItem of params.items) {
          const mappedLineId = `retline_${returnId}_${inputItem.lineId}`;
          const exItem = existingData.items.find(
            (e) => e.lineId === mappedLineId
          );

          if (
            !exItem ||
            exItem.productId !== inputItem.productId ||
            exItem.quantity !== inputItem.quantity
          ) {
            isMatch = false;
            break;
          }

          if (
            inputItem.returnPrice !== undefined &&
            exItem.returnPrice !== inputItem.returnPrice
          ) {
            isMatch = false;
            break;
          }
        }
      }

      if (!isMatch) {
        throw new Error(
          'يوجد مرتجع بنفس المعرف ولكن ببيانات مختلفة.'
        );
      }

      // Validate Supplier Transaction Dependent
      if (!supTxSnap.exists()) {
        throw new Error('حالة مرتجع المشتريات غير متسقة.');
      }

      const supTxData = supTxSnap.data() as SupplierTransaction;

      if (
        supTxData.supplierId !== params.supplierId ||
        supTxData.type !== 'out' ||
        supTxData.amount !== existingData.totalAmount ||
        supTxData.referenceType !== 'purchase_return' ||
        supTxData.referenceId !== returnId
      ) {
        throw new Error('حالة مرتجع المشتريات غير متسقة.');
      }

      // Validate Cashbox Transaction Dependent
      if (expectsCashTx) {
        if (!cashTxSnap.exists()) {
          throw new Error('حالة مرتجع المشتريات غير متسقة.');
        }

        const cashTxData = cashTxSnap.data() as CashboxTransaction;

        if (
          cashTxData.cashboxId !== params.cashboxId ||
          cashTxData.type !== 'in' ||
          cashTxData.amount !== existingData.refundedAmount ||
          cashTxData.referenceType !== 'purchase_return' ||
          cashTxData.referenceId !== returnId
        ) {
          throw new Error('حالة مرتجع المشتريات غير متسقة.');
        }
      } else {
        if (cashTxSnap.exists()) {
          throw new Error('حالة مرتجع المشتريات غير متسقة.');
        }
      }

      // Validate Inventory Movements
      for (let i = 0; i < params.items.length; i++) {
        const inputItem = params.items[i];
        const movSnap = movementSnaps[i];

        if (!movSnap.exists()) {
          throw new Error('حالة مرتجع المشتريات غير متسقة.');
        }

        const movData = movSnap.data() as InventoryMovement;

        if (
          movData.productId !== inputItem.productId ||
          movData.warehouseId !== params.warehouseId ||
          movData.quantityOut !== inputItem.quantity ||
          movData.referenceType !== 'purchase_return' ||
          movData.referenceId !== returnId ||
          movData.sourceLineId !== inputItem.lineId
        ) {
          throw new Error('حالة مرتجع المشتريات غير متسقة.');
        }
      }

      return;
    }

    // Partial State Reject when Return does not exist
    if (
      supTxSnap.exists() ||
      cashTxSnap.exists() ||
      movementSnaps.some((s) => s.exists())
    ) {
      throw new Error('حالة مرتجع المشتريات غير متسقة.');
    }

    // ======================================
    // B. READ PHASE 2: New Processing
    // ======================================

    const supplierRef = doc(
      db,
      SUPPLIERS_COLLECTION,
      params.supplierId
    );

    const warehouseRef = doc(
      db,
      WAREHOUSES_COLLECTION,
      params.warehouseId
    );

    const supplierSnap = await transaction.get(supplierRef);
    const warehouseSnap = await transaction.get(warehouseRef);

    let cashboxSnap = null;

    if (expectsCashTx && params.cashboxId) {
      const cashboxRef = doc(
        db,
        CASHBOXES_COLLECTION,
        params.cashboxId
      );
      cashboxSnap = await transaction.get(cashboxRef);
    }

    const productRefs = params.items.map((item) =>
      doc(db, PRODUCTS_COLLECTION, item.productId)
    );

    const invItemRefs = params.items.map((item) =>
      doc(
        db,
        INVENTORY_COLLECTION,
        `${params.warehouseId}_${item.productId}`
      )
    );

    const layerTrackerRefs = params.items.map((item) =>
      doc(
        db,
        INVENTORY_LAYERS_COLLECTION,
        `${params.warehouseId}_${item.productId}`
      )
    );

    const productSnaps = await Promise.all(
      productRefs.map((ref) => transaction.get(ref))
    );

    const invItemSnaps = await Promise.all(
      invItemRefs.map((ref) => transaction.get(ref))
    );

    const layerTrackerSnaps = await Promise.all(
      layerTrackerRefs.map((ref) => transaction.get(ref))
    );

    // ======================================
    // C. VALIDATION & CALCULATION PHASE
    // ======================================

    if (
      !supplierSnap.exists() ||
      (supplierSnap.data() as Supplier).isActive === false
    ) {
      throw new Error('المورد غير موجود أو غير نشط.');
    }

    if (
      !warehouseSnap.exists() ||
      (warehouseSnap.data() as Warehouse).isActive === false
    ) {
      throw new Error('المخزن غير موجود أو غير نشط.');
    }

    if (expectsCashTx) {
      if (
        !cashboxSnap ||
        !cashboxSnap.exists() ||
        (cashboxSnap.data() as Cashbox).isActive === false
      ) {
        throw new Error(
          'الخزينة المحددة للاسترداد غير موجودة أو غير نشطة.'
        );
      }
    }

    productSnaps.forEach((snap, index) => {
      if (
        !snap.exists() ||
        (snap.data() as Product).isActive === false
      ) {
        throw new Error(
          `المنتج المطلوب إرجاعه في السطر ${
            index + 1
          } غير موجود أو غير نشط.`
        );
      }
    });

    let totalReturnAmount = 0;
    const resolvedItems: PurchaseReturnItem[] = [];

    // First iteration to validate inventory and calculate prices
    for (let i = 0; i < params.items.length; i++) {
      const inputItem = params.items[i];
      const invSnap = invItemSnaps[i];
      const trackerSnap = layerTrackerSnaps[i];

      if (!invSnap.exists()) {
        throw new Error(
          'لا توجد بيانات مخزون صالحة لهذا المنتج في المخزن المحدد.'
        );
      }

      const invData = invSnap.data() as InventoryItem;

      if (!Number.isFinite(invData.wac)) {
        throw new Error(
          'لا توجد بيانات مخزون صالحة لهذا المنتج في المخزن المحدد.'
        );
      }

      let supplierAvailableQty = 0;

      if (trackerSnap.exists()) {
        const trackerData =
          trackerSnap.data() as InventoryLayerTracker;
        const activeLayers = trackerData.activeLayers || [];

        for (const layer of activeLayers) {
          if (
            !layer.isLegacy &&
            layer.supplierId === params.supplierId &&
            layer.remainingQuantity > 0
          ) {
            supplierAvailableQty += layer.remainingQuantity;
          }
        }
      }

      if (
        supplierAvailableQty + TOLERANCE <
        inputItem.quantity
      ) {
        throw new Error(
          'لا توجد كمية متاحة لإرجاع هذا المنتج من المورد المحدد في هذا المخزن.'
        );
      }

      const finalReturnPrice =
        inputItem.returnPrice !== undefined
          ? inputItem.returnPrice
          : invData.wac;

      const lineTotalAmount = Number(
        (inputItem.quantity * finalReturnPrice).toFixed(4)
      );

      totalReturnAmount = Number(
        (totalReturnAmount + lineTotalAmount).toFixed(4)
      );

      resolvedItems.push({
        lineId: `retline_${returnId}_${inputItem.lineId}`,
        productId: inputItem.productId,
        quantity: inputItem.quantity,
        returnPrice: finalReturnPrice,
        totalAmount: lineTotalAmount
      });
    }

    if (totalReturnAmount <= 0) {
      throw new Error(
        'إجمالي قيمة المرتجع يجب أن يكون أكبر من صفر.'
      );
    }

    let refundedAmount = 0;
    let supplierCreditAmount = 0;

    if (expectsCashTx) {
      refundedAmount = totalReturnAmount;
      supplierCreditAmount = 0;
    } else {
      refundedAmount = 0;
      supplierCreditAmount = totalReturnAmount;
    }

    // ======================================
    // D. PREPARE PHASE
    // ======================================

    const preparedStockOuts: PreparedStockOut[] = [];

    const invoiceUpdatesMap = new Map<
      string,
      {
        [lineId: string]: {
          qty: number;
          productId: string;
        };
      }
    >();

    for (let i = 0; i < params.items.length; i++) {
      const inputItem = params.items[i];
      const trackerSnap = layerTrackerSnaps[i];

      const originalTrackerData = trackerSnap.exists()
        ? (trackerSnap.data() as InventoryLayerTracker)
        : null;

      // Prepare Stock Out (Handles Supplier-filtered LIFO internally inside inventoryService)
      const preparedOut =
        await prepareStockOutInTransaction(transaction, {
          productId: inputItem.productId,
          warehouseId: params.warehouseId,
          quantity: inputItem.quantity,
          referenceType: 'purchase_return',
          referenceId: returnId,
          sourceLineId: inputItem.lineId,
          description: `مرتجع مشتريات للمورد`,
          createdBy: params.createdBy,
          supplierId: params.supplierId
        });

      preparedStockOuts.push(preparedOut);

      // Deduce impacted invoices dynamically from layer changes
      if (
        !preparedOut.isIdempotent &&
        originalTrackerData &&
        preparedOut.trackerData
      ) {
        const oldLayers =
          originalTrackerData.activeLayers;
        const newLayers =
          preparedOut.trackerData.activeLayers;

        for (const oldLayer of oldLayers) {
          if (
            !oldLayer.isLegacy &&
            oldLayer.supplierId === params.supplierId &&
            oldLayer.purchaseInvoiceId &&
            oldLayer.purchaseInvoiceId !== 'LEGACY'
          ) {
            const newLayer = newLayers.find(
              (l) => l.layerId === oldLayer.layerId
            );

            const newRemaining = newLayer
              ? newLayer.remainingQuantity
              : 0;

            const deduct = Number(
              (
                oldLayer.remainingQuantity -
                newRemaining
              ).toFixed(4)
            );

            if (deduct > 0) {
              if (
                !invoiceUpdatesMap.has(
                  oldLayer.purchaseInvoiceId
                )
              ) {
                invoiceUpdatesMap.set(
                  oldLayer.purchaseInvoiceId,
                  {}
                );
              }

              const invLines =
                invoiceUpdatesMap.get(
                  oldLayer.purchaseInvoiceId
                )!;

              if (
                !invLines[oldLayer.purchaseLineId]
              ) {
                invLines[oldLayer.purchaseLineId] = {
                  qty: 0,
                  productId: inputItem.productId
                };
              }

              invLines[
                oldLayer.purchaseLineId
              ].qty = Number(
                (
                  invLines[
                    oldLayer.purchaseLineId
                  ].qty + deduct
                ).toFixed(4)
              );
            }
          }
        }
      }
    }

    // READ PHASE 3: Read affected invoices safely before any writes
    const invoiceIdsToFetch = Array.from(
      invoiceUpdatesMap.keys()
    );

    const invoiceSnaps = await Promise.all(
      invoiceIdsToFetch.map((invId) =>
        transaction.get(
          doc(
            db,
            INVOICES_COLLECTION,
            invId
          )
        )
      )
    );

    // Validate Invoices & Calculate Updates
    const invoicesToUpdate = new Map<
      string,
      PurchaseInvoice
    >();

    const now = Timestamp.now().toDate();

    for (const invSnap of invoiceSnaps) {
      if (!invSnap.exists()) {
        throw new Error(
          'حالة مرتجع المشتريات غير متسقة.'
        );
      }

      const invData =
        invSnap.data() as PurchaseInvoice;

      if (
        invData.supplierId !==
          params.supplierId ||
        invData.warehouseId !==
          params.warehouseId
      ) {
        throw new Error(
          'حالة مرتجع المشتريات غير متسقة.'
        );
      }

      const updatesForThisInvoice =
        invoiceUpdatesMap.get(
          invSnap.id
        );

      if (updatesForThisInvoice) {
        let hasAnyReturn = false;
        let isFullyReturned = true;

        for (const [
          lineId,
          updateData
        ] of Object.entries(
          updatesForThisInvoice
        )) {
          const invItem =
            invData.items.find(
              (item) =>
                item.lineId === lineId
            );

          if (
            !invItem ||
            invItem.productId !==
              updateData.productId
          ) {
            throw new Error(
              'حالة مرتجع المشتريات غير متسقة.'
            );
          }

          const currentRetQty =
            Number.isFinite(
              invItem.returnedQuantity
            )
              ? invItem.returnedQuantity!
              : 0;

          const newReturnedQuantity =
            Number(
              (
                currentRetQty +
                updateData.qty
              ).toFixed(4)
            );

          if (
            newReturnedQuantity >
            invItem.quantity +
              TOLERANCE
          ) {
            throw new Error(
              'حالة مرتجع المشتريات غير متسقة.'
            );
          }

          invItem.returnedQuantity =
            newReturnedQuantity;
        }

        invData.items.forEach(
          (invItem) => {
            if (
              (invItem.returnedQuantity ||
                0) > 0
            ) {
              hasAnyReturn = true;
            }

            if (
              (invItem.returnedQuantity ||
                0) <
              invItem.quantity -
                TOLERANCE
            ) {
              isFullyReturned = false;
            }
          }
        );

        if (hasAnyReturn) {
          invData.status =
            isFullyReturned
              ? 'fully_returned'
              : 'partially_returned';

          invData.updatedAt = now;

          invoicesToUpdate.set(
            invSnap.id,
            invData
          );
        }
      }
    }

    let preparedCashboxTx:
      | PreparedManualTransaction
      | null = null;

    if (expectsCashTx) {
      preparedCashboxTx =
        await prepareManualTransactionInTransaction(
          transaction,
          {
            cashboxId:
              params.cashboxId!,
            type: 'in',
            amount: refundedAmount,
            referenceType:
              'purchase_return',
            referenceId: returnId,
            description: `استرداد نقدي من المورد عن مرتجع رقم: ${returnNumber}`,
            createdBy:
              params.createdBy
          },
          `cash_tx_ret_${returnId}`
        );
    }

    // Always create supplier transaction (out) to decrease supplier balance
    const preparedSupplierTx =
      await prepareSupplierTransactionInTransaction(
        transaction,
        {
          supplierId:
            params.supplierId,
          type: 'out',
          amount:
            totalReturnAmount,
          referenceType:
            'purchase_return',
          referenceId: returnId,
          description: `تسوية مرتجع مشتريات رقم: ${returnNumber}`,
          createdBy:
            params.createdBy
        },
        `sup_tx_ret_${returnId}`
      );

    // ======================================
    // E. COMMIT PHASE (WRITES ONLY)
    // ======================================

    for (const preparedStock of preparedStockOuts) {
      commitStockOutInTransaction(
        transaction,
        preparedStock
      );
    }

    if (preparedCashboxTx) {
      commitManualTransactionInTransaction(
        transaction,
        preparedCashboxTx
      );
    }

    commitSupplierTransactionInTransaction(
      transaction,
      preparedSupplierTx
    );

    invoicesToUpdate.forEach(
      (invData, invId) => {
        transaction.update(
          doc(
            db,
            INVOICES_COLLECTION,
            invId
          ),
          {
            items: invData.items,
            status: invData.status,
            updatedAt:
              invData.updatedAt
          }
        );
      }
    );

    const returnData:
      Partial<PurchaseReturn> = {
      returnNumber: returnNumber,
      supplierId:
        params.supplierId,
      warehouseId:
        params.warehouseId,
      items: resolvedItems,
      totalAmount:
        totalReturnAmount,
      refundedAmount:
        refundedAmount,
      supplierCreditAmount:
        supplierCreditAmount,
      status: 'completed',
      createdBy:
        params.createdBy,
      createdAt: now,
      updatedAt: now
    };

    if (
      expectsCashTx &&
      params.cashboxId
    ) {
      returnData.cashboxId =
        params.cashboxId;
    }

    transaction.set(
      returnRef,
      returnData as PurchaseReturn
    );
  });
};

// ==========================================
// 4. Public Queries
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

    return snapshot.docs.map(
      (doc) => {
        const data =
          doc.data();

        return {
          id: doc.id,
          ...data,
          createdAt:
            toDateSafe(
              data.createdAt
            ),
          updatedAt:
            toDateSafe(
              data.updatedAt
            )
        } as PurchaseReturn;
      }
    );
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

    const data =
      snap.data();

    return {
      id: snap.id,
      ...data,
      createdAt:
        toDateSafe(
          data.createdAt
        ),
      updatedAt:
        toDateSafe(
          data.updatedAt
        )
    } as PurchaseReturn;
  };
