import { doc, collection, runTransaction, getDocs, query, where, orderBy, Timestamp, Transaction as FirestoreTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Cashbox, CashboxTransaction, FinancialReferenceType, TransactionType } from '../types';

const CASHBOXES_COLLECTION = 'cashboxes';
const TRANSACTIONS_COLLECTION = 'cashbox_transactions';

// تم إرجاع الاسم لـ ManualTransactionParams ليتطابق مع الـ Store
export interface ManualTransactionParams {
  cashboxId: string;
  type: TransactionType;
  amount: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  description: string;
  createdBy: string;
}

export interface TransferOperationParams {
  sourceCashboxId: string;
  destCashboxId: string;
  amount: number;
  transferId: string; // معرف فريد للتحويل لمنع التكرار
  description?: string;
  createdBy: string;
}

// دالة مساعدة للتحقق من الأرقام
const validateAmount = (val: number) => {
  if (!Number.isFinite(val) || Number.isNaN(val) || val <= 0) {
    throw new Error('قيمة المعاملة غير صالحة: يجب أن تكون رقماً أكبر من الصفر');
  }
};

// ==========================================
// 1. Transaction-Aware Internal Functions
// ==========================================

export const processManualTransactionInTransaction = async (
  transaction: FirestoreTransaction,
  params: ManualTransactionParams
): Promise<void> => {
  validateAmount(params.amount);

  // --- مرحلة 1: القراءات (Reads) ---
  const transactionDocId = `${params.referenceId}_${params.type}_${params.cashboxId}`;
  const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionDocId);
  const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);

  const [transactionSnap, cashboxSnap] = await Promise.all([
    transaction.get(transactionRef),
    transaction.get(cashboxRef)
  ]);

  if (transactionSnap.exists()) return;

  if (!cashboxSnap.exists()) {
    throw new Error(`الخزينة المطلوبة غير موجودة (${params.cashboxId})`);
  }

  // --- مرحلة 2: الحسابات (Calculations) ---
  const cashboxData = cashboxSnap.data() as Cashbox;
  const currentBalance = Number.isFinite(cashboxData.balance) ? cashboxData.balance : 0;

  let newBalance = currentBalance;
  if (params.type === 'in') {
    newBalance += params.amount;
  } else {
    if (currentBalance < params.amount) {
      throw new Error(`رصيد الخزينة غير كافٍ. المتاح: ${currentBalance}`);
    }
    newBalance -= params.amount;
  }
  
  newBalance = Number(newBalance.toFixed(4));
  const now = Timestamp.now();

  const transactionData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.cashboxId,
    type: params.type,
    amount: params.amount,
    balanceAfter: newBalance,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    description: params.description,
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
  };

  // --- مرحلة 3: الكتابات (Writes) ---
  transaction.set(transactionRef, transactionData);
  transaction.update(cashboxRef, { balance: newBalance, updatedAt: now as unknown as Date });
};

export const processTransferInTransaction = async (
  transaction: FirestoreTransaction,
  params: TransferOperationParams
): Promise<void> => {
  if (params.sourceCashboxId === params.destCashboxId) {
    throw new Error('لا يمكن التحويل لنفس الخزينة');
  }
  validateAmount(params.amount);

  const outTransactionId = `${params.transferId}_out_${params.sourceCashboxId}`;
  const inTransactionId = `${params.transferId}_in_${params.destCashboxId}`;
  
  const outRef = doc(db, TRANSACTIONS_COLLECTION, outTransactionId);
  const inRef = doc(db, TRANSACTIONS_COLLECTION, inTransactionId);

  const sourceCashboxRef = doc(db, CASHBOXES_COLLECTION, params.sourceCashboxId);
  const destCashboxRef = doc(db, CASHBOXES_COLLECTION, params.destCashboxId);

  const [outSnap, inSnap, sourceSnap, destSnap] = await Promise.all([
    transaction.get(outRef),
    transaction.get(inRef),
    transaction.get(sourceCashboxRef),
    transaction.get(destCashboxRef)
  ]);

  const outExists = outSnap.exists();
  const inExists = inSnap.exists();

  if (outExists && inExists) return;
  if (outExists !== inExists) {
    throw new Error(`حالة تحويل مالي غير متسقة: يجب أن تكون حركتا التحويل الصادر والوارد موجودتين معًا أو غير موجودتين معًا.`);
  }

  if (!sourceSnap.exists()) throw new Error('الخزينة المصدر غير موجودة');
  if (!destSnap.exists()) throw new Error('الخزينة المستقبلة غير موجودة');

  const sourceData = sourceSnap.data() as Cashbox;
  const destData = destSnap.data() as Cashbox;

  const sourceBalance = Number.isFinite(sourceData.balance) ? sourceData.balance : 0;
  const destBalance = Number.isFinite(destData.balance) ? destData.balance : 0;

  if (sourceBalance < params.amount) {
    throw new Error(`رصيد الخزينة المصدر غير كافٍ. المتاح: ${sourceBalance}`);
  }

  const newSourceBalance = Number((sourceBalance - params.amount).toFixed(4));
  const newDestBalance = Number((destBalance + params.amount).toFixed(4));
  const now = Timestamp.now();

  const outTransactionData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.sourceCashboxId,
    type: 'out',
    amount: params.amount,
    balanceAfter: newSourceBalance,
    referenceType: 'transfer',
    referenceId: params.transferId,
    description: params.description || 'تحويل صادر',
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
  };

  const inTransactionData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.destCashboxId,
    type: 'in',
    amount: params.amount,
    balanceAfter: newDestBalance,
    referenceType: 'transfer',
    referenceId: params.transferId,
    description: params.description || 'تحويل وارد',
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
  };

  transaction.set(outRef, outTransactionData);
  transaction.set(inRef, inTransactionData);
  transaction.update(sourceCashboxRef, { balance: newSourceBalance, updatedAt: now as unknown as Date });
  transaction.update(destCashboxRef, { balance: newDestBalance, updatedAt: now as unknown as Date });
};

// ==========================================
// 2. Public Wrappers (Phase 1 Compatibility)
// ==========================================

export const processManualTransaction = async (params: ManualTransactionParams): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    await processManualTransactionInTransaction(transaction, params);
  });
};

export const processTransfer = async (params: TransferOperationParams): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    await processTransferInTransaction(transaction, params);
  });
};

// ==========================================
// 3. Reversal Functions (To satisfy the Store requirements)
// ==========================================

export const reverseTransaction = async (transactionId: string, createdBy: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("المعاملة غير موجودة");

    const txData = txSnap.data() as CashboxTransaction;
    const cashboxRef = doc(db, CASHBOXES_COLLECTION, txData.cashboxId);
    const cashboxSnap = await transaction.get(cashboxRef);
    if (!cashboxSnap.exists()) throw new Error("الخزينة غير موجودة");

    const cashboxData = cashboxSnap.data() as Cashbox;
    const currentBalance = cashboxData.balance;
    const reverseType: TransactionType = txData.type === 'in' ? 'out' : 'in';

    if (reverseType === 'out' && currentBalance < txData.amount) {
      throw new Error("رصيد الخزينة غير كافٍ لإلغاء هذه المعاملة");
    }

    const newBalance = reverseType === 'in' ? currentBalance + txData.amount : currentBalance - txData.amount;
    const now = Timestamp.now();

    const revTxId = `rev_${transactionId}`;
    const revTxRef = doc(db, TRANSACTIONS_COLLECTION, revTxId);
    
    const revSnap = await transaction.get(revTxRef);
    if (revSnap.exists()) throw new Error("تم إلغاء هذه المعاملة مسبقاً");

    const newTxData: Omit<CashboxTransaction, 'id'> = {
        cashboxId: txData.cashboxId,
        type: reverseType,
        amount: txData.amount,
        balanceAfter: Number(newBalance.toFixed(4)),
        referenceType: txData.referenceType,
        referenceId: `rev_${txData.referenceId}`,
        description: `إلغاء معاملة: ${txData.description}`,
        createdBy: createdBy,
        createdAt: now as unknown as Date,
    };

    transaction.set(revTxRef, newTxData);
    transaction.update(cashboxRef, { balance: Number(newBalance.toFixed(4)), updatedAt: now as unknown as Date });
  });
};

export const reverseTransfer = async (transferId: string, createdBy: string): Promise<void> => {
  // لأغراض الأمان في النظام المحاسبي، يتم رمي خطأ لإجبار المستخدم على عمل تحويل عكسي يدوياً
  throw new Error("عفواً، لضمان سلامة الأرصدة، يرجى عمل تحويل مالي عكسي يدوياً لإلغاء هذا التحويل.");
};

// ==========================================
// 4. Read-Only Public Functions
// ==========================================

export const getCashboxLedger = async (cashboxId: string): Promise<CashboxTransaction[]> => {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('cashboxId', '==', cashboxId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as CashboxTransaction;
  });
};
