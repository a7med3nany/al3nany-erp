import {
  doc,
  collection,
  runTransaction,
  Transaction as FirestoreTransaction
} from 'firebase/firestore';
import { db } from '../config/firebase';

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

const SUPPLIER_TX_COLLECTION = 'supplier_transactions';
const CASHBOX_TX_COLLECTION = 'cashbox_transactions';

// ==========================================
// 1. Interfaces
// ==========================================

export interface CreateSupplierPaymentParams {
  paymentId?: string;
  supplierId: string;
  amount: number;
  paymentMethod: 'cash' | 'other';
  cashboxId?: string;
  description: string;
  createdBy: string;
}

// ==========================================
// 2. Validation & Helpers
// ==========================================

const validatePaymentParams = (params: CreateSupplierPaymentParams) => {
  if (!params.supplierId) {
    throw new Error('معرف المورد مطلوب.');
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error('مبلغ الدفعة يجب أن يكون رقماً أكبر من الصفر.');
  }

  if (params.paymentMethod === 'cash' && !params.cashboxId) {
    throw new Error('معرف الخزينة مطلوب عند تحديد طريقة الدفع النقدي.');
  }

  if (!params.createdBy) {
    throw new Error('معرف منشئ العملية (createdBy) مطلوب.');
  }
};

// ==========================================
// 3. Core Supplier Payment Service (Atomic)
// ==========================================

export const createSupplierPayment = async (params: CreateSupplierPaymentParams): Promise<void> => {
  validatePaymentParams(params);

  // Idempotency Key Generation (Generated ONCE outside the transaction)
  const paymentId = params.paymentId || doc(collection(db, SUPPLIER_TX_COLLECTION)).id;
  const supTxId = `sup_tx_pay_${paymentId}`;
  const cashTxId = `cash_tx_pay_${paymentId}`;

  await runTransaction(db, async (transaction: FirestoreTransaction) => {
    // ======================================
    // A. READ PHASE 1: Partial State Check
    // ======================================
    const supTxRef = doc(db, SUPPLIER_TX_COLLECTION, supTxId);
    const supTxSnap = await transaction.get(supTxRef);

    let cashTxSnap = null;
    if (params.paymentMethod === 'cash') {
      const cashTxRef = doc(db, CASHBOX_TX_COLLECTION, cashTxId);
      cashTxSnap = await transaction.get(cashTxRef);
    }

    // Check for inconsistent partial states before doing further processing
    if (supTxSnap.exists()) {
      if (params.paymentMethod === 'cash' && (!cashTxSnap || !cashTxSnap.exists())) {
        throw new Error('حالة عملية الدفع غير متسقة.');
      }
    } else {
      if (cashTxSnap && cashTxSnap.exists()) {
        throw new Error('حالة عملية الدفع غير متسقة.');
      }
    }

    // ======================================
    // B. PREPARE PHASE (In-Memory Processing)
    // ======================================

    // 1. Prepare Supplier Transaction (Handles its own deep read, balance update, and idempotency check)
    // Type 'out' is used because paying the supplier decreases the amount we owe them (decreases positive balance).
    // The service inherently allows the supplier balance to go negative (representing credit).
    const preparedSupplierTx: PreparedSupplierTransaction = await prepareSupplierTransactionInTransaction(
      transaction,
      {
        supplierId: params.supplierId,
        type: 'out',
        amount: params.amount,
        referenceType: 'supplier_payment',
        referenceId: paymentId,
        description: params.description,
        createdBy: params.createdBy
      },
      supTxId
    );

    // 2. Prepare Cashbox Transaction (Handles its own deep read, strict balance sufficiency check, and idempotency check)
    let preparedCashboxTx: PreparedManualTransaction | null = null;
    if (params.paymentMethod === 'cash') {
      preparedCashboxTx = await prepareManualTransactionInTransaction(
        transaction,
        {
          cashboxId: params.cashboxId!,
          type: 'out', // Money is leaving our cashbox
          amount: params.amount,
          referenceType: 'supplier_payment',
          referenceId: paymentId,
          description: params.description,
          createdBy: params.createdBy
        },
        cashTxId
      );
    }

    // ======================================
    // C. COMMIT PHASE (WRITES ONLY)
    // ======================================

    commitSupplierTransactionInTransaction(transaction, preparedSupplierTx);

    if (preparedCashboxTx) {
      commitManualTransactionInTransaction(transaction, preparedCashboxTx);
    }
  });
};
