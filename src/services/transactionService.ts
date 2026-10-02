import { doc, collection, runTransaction, getDocs, query, where, orderBy, Timestamp, Transaction as FirestoreTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Cashbox, CashboxTransaction, FinancialReferenceType, TransactionType } from '../types';

const CASHBOXES_COLLECTION = 'cashboxes';
const TRANSACTIONS_COLLECTION = 'cashbox_transactions';

export interface ManualTransactionParams {
  cashboxId: string;
  type: TransactionType;
  amount: number;
  referenceType?: FinancialReferenceType;
  referenceId?: string;
  description?: string;
  createdBy: string;
}

export interface TransferOperationParams {
  sourceCashboxId: string;
  destCashboxId: string;
  amount: number;
  transferId?: string; 
  description?: string;
  createdBy: string;
}

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
  params: ManualTransactionParams,
  generatedId: string
): Promise<void> => {
  if (!params.cashboxId) throw new Error("معرف الخزينة مفقود");
  if (params.type !== 'in' && params.type !== 'out') throw new Error(`نوع العملية غير صالح: ${params.type}. يجب أن يكون 'in' أو 'out' فقط.`);
  
  validateAmount(params.amount);

  const transactionRef = doc(db, TRANSACTIONS_COLLECTION, generatedId);
  const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);

  const [transactionSnap, cashboxSnap] = await Promise.all([
    transaction.get(transactionRef),
    transaction.get(cashboxRef)
  ]);

  if (transactionSnap.exists()) return; // Idempotency check

  if (!cashboxSnap.exists()) {
    throw new Error(`الخزينة المطلوبة غير موجودة (${params.cashboxId})`);
  }

  const cashboxData = cashboxSnap.data() as Cashbox;
  
  // الحماية من التعامل مع خزينة معطلة
  if (cashboxData.isActive === false) {
    throw new Error(`لا يمكن إجراء عمليات مالية على خزينة غير نشطة (${cashboxData.name})`);
  }

  const currentBalance = Number.isFinite(cashboxData.balance) ? cashboxData.balance : 0;

  let newBalance = currentBalance;
  if (params.type === 'in') {
    newBalance += params.amount;
  } else {
    // الحماية من الرصيد السالب بداخل Transaction
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
    referenceType: params.referenceType || 'manual',
    referenceId: params.referenceId || generatedId,
    description: params.description || '',
    createdBy: params.createdBy || 'system',
    createdAt: now as unknown as Date,
  };

  transaction.set(transactionRef, transactionData);
  transaction.update(cashboxRef, { balance: newBalance, updatedAt: now as unknown as Date });
};

export const processTransferInTransaction = async (
  transaction: FirestoreTransaction,
  params: TransferOperationParams,
  transferId: string
): Promise<void> => {
  if (!params.sourceCashboxId || !params.destCashboxId) throw new Error("معرف الخزينة المصدر أو المستقبل مفقود");
  if (params.sourceCashboxId === params.destCashboxId) throw new Error("لا يمكن التحويل لنفس الخزينة");
  
  validateAmount(params.amount);

  const outRef = doc(db, TRANSACTIONS_COLLECTION, `${transferId}_out_${params.sourceCashboxId}`);
  const inRef = doc(db, TRANSACTIONS_COLLECTION, `${transferId}_in_${params.destCashboxId}`);

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

  if (outExists && inExists) return; // Idempotency check
  if (outExists !== inExists) {
    throw new Error(`حالة تحويل مالي غير متسقة. يرجى مراجعة الدعم الفني.`);
  }

  if (!sourceSnap.exists()) throw new Error('الخزينة المصدر غير موجودة');
  if (!destSnap.exists()) throw new Error('الخزينة المستقبلة غير موجودة');

  const sourceData = sourceSnap.data() as Cashbox;
  const destData = destSnap.data() as Cashbox;

  if (sourceData.isActive === false) throw new Error(`الخزينة المصدر (${sourceData.name}) غير نشطة.`);
  if (destData.isActive === false) throw new Error(`الخزينة المستقبلة (${destData.name}) غير نشطة.`);

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
    referenceId: transferId,
    description: params.description || 'تحويل صادر',
    createdBy: params.createdBy || 'system',
    createdAt: now as unknown as Date,
  };

  const inTransactionData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.destCashboxId,
    type: 'in',
    amount: params.amount,
    balanceAfter: newDestBalance,
    referenceType: 'transfer',
    referenceId: transferId,
    description: params.description || 'تحويل وارد',
    createdBy: params.createdBy || 'system',
    createdAt: now as unknown as Date,
  };

  transaction.set(outRef, outTransactionData);
  transaction.set(inRef, inTransactionData);
  transaction.update(sourceCashboxRef, { balance: newSourceBalance, updatedAt: now as unknown as Date });
  transaction.update(destCashboxRef, { balance: newDestBalance, updatedAt: now as unknown as Date });
};

// ==========================================
// 2. Public Wrappers
// ==========================================

export const processManualTransaction = async (params: ManualTransactionParams): Promise<void> => {
  const generatedId = params.referenceId 
    ? `${params.referenceId}_${params.type}_${params.cashboxId}` 
    : doc(collection(db, TRANSACTIONS_COLLECTION)).id;

  await runTransaction(db, async (transaction) => {
    await processManualTransactionInTransaction(transaction, params, generatedId);
  });
};

export const processTransfer = async (params: TransferOperationParams): Promise<void> => {
  const transferId = params.transferId || doc(collection(db, TRANSACTIONS_COLLECTION)).id;

  await runTransaction(db, async (transaction) => {
    await processTransferInTransaction(transaction, params, transferId);
  });
};

// ==========================================
// 3. Reversal Functions
// ==========================================

export const reverseTransaction = async (transactionId: string, createdBy: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const txSnap = await transaction.get(txRef);
    
    if (!txSnap.exists()) throw new Error("المعاملة غير موجودة");

    const txData = txSnap.data() as CashboxTransaction;
    
    // منع استخدام هذه الدالة لعكس التحويلات
    if (txData.referenceType === 'transfer') {
      throw new Error("هذه الحركة جزء من تحويل مالي. يرجى استخدام وظيفة عكس التحويل المخصصة.");
    }

    const cashboxRef = doc(db, CASHBOXES_COLLECTION, txData.cashboxId);
    const cashboxSnap = await transaction.get(cashboxRef);
    if (!cashboxSnap.exists()) throw new Error("الخزينة غير موجودة");

    const cashboxData = cashboxSnap.data() as Cashbox;
    const currentBalance = cashboxData.balance;
    const reverseType: TransactionType = txData.type === 'in' ? 'out' : 'in';

    // حماية الرصيد أثناء الإلغاء
    if (reverseType === 'out' && currentBalance < txData.amount) {
      throw new Error("رصيد الخزينة غير كافٍ لإلغاء هذه المعاملة (استرداد المبلغ سيؤدي لرصيد سالب).");
    }

    const newBalance = reverseType === 'in' ? currentBalance + txData.amount : currentBalance - txData.amount;
    const now = Timestamp.now();

    const revTxId = `rev_${transactionId}`;
    const revTxRef = doc(db, TRANSACTIONS_COLLECTION, revTxId);
    
    // منع الإلغاء المزدوج
    const revSnap = await transaction.get(revTxRef);
    if (revSnap.exists()) throw new Error("تم إلغاء هذه المعاملة مسبقاً.");

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
  // 1. جلب بيانات التحويل الأصلية من خارج الـ Transaction لضمان الوصول الدقيق للأطراف
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('referenceId', '==', transferId),
    where('referenceType', '==', 'transfer')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty || snapshot.size !== 2) {
    throw new Error("بيانات التحويل الأصلي غير مكتملة أو غير موجودة بالسجل.");
  }

  let outTxDoc: { id: string, data: CashboxTransaction } | undefined;
  let inTxDoc: { id: string, data: CashboxTransaction } | undefined;

  snapshot.forEach(doc => {
    const data = doc.data() as CashboxTransaction;
    if (data.type === 'out') outTxDoc = { id: doc.id, data };
    if (data.type === 'in') inTxDoc = { id: doc.id, data };
  });

  if (!outTxDoc || !inTxDoc || outTxDoc.data.amount !== inTxDoc.data.amount) {
    throw new Error("تطابق التحويل غير صحيح.");
  }

  const originalAmount = outTxDoc.data.amount;
  const originalSourceId = outTxDoc.data.cashboxId;
  const originalDestId = inTxDoc.data.cashboxId;

  // 2. تنفيذ الإلغاء الذري
  await runTransaction(db, async (transaction) => {
    const sourceCashboxRef = doc(db, CASHBOXES_COLLECTION, originalSourceId);
    const destCashboxRef = doc(db, CASHBOXES_COLLECTION, originalDestId);

    const revOutTxId = `rev_${outTxDoc!.id}`;
    const revInTxId = `rev_${inTxDoc!.id}`;
    
    const revOutTxRef = doc(db, TRANSACTIONS_COLLECTION, revOutTxId);
    const revInTxRef = doc(db, TRANSACTIONS_COLLECTION, revInTxId);

    const [sourceSnap, destSnap, revOutSnap, revInSnap] = await Promise.all([
      transaction.get(sourceCashboxRef),
      transaction.get(destCashboxRef),
      transaction.get(revOutTxRef),
      transaction.get(revInTxRef)
    ]);

    // التحقق من الإلغاء المزدوج
    if (revOutSnap.exists() || revInSnap.exists()) {
      throw new Error("تم عكس هذا التحويل مسبقاً.");
    }

    if (!sourceSnap.exists() || !destSnap.exists()) {
      throw new Error("إحدى الخزائن المرتبطة بهذا التحويل تم حذفها أو غير موجودة.");
    }

    const sourceData = sourceSnap.data() as Cashbox;
    const destData = destSnap.data() as Cashbox;

    const currentSourceBalance = sourceData.balance;
    const currentDestBalance = destData.balance;

    // حماية الرصيد: يجب أن تمتلك الخزينة المستقبلة رصيداً يكفي لإرجاعه للمصدر
    if (currentDestBalance < originalAmount) {
      throw new Error(`رصيد الخزينة المستقبلة (${destData.name}) غير كافٍ لاسترجاع مبلغ التحويل.`);
    }

    const newSourceBalance = Number((currentSourceBalance + originalAmount).toFixed(4));
    const newDestBalance = Number((currentDestBalance - originalAmount).toFixed(4));
    const now = Timestamp.now();

    // الحركات العكسية
    const reverseOutTxData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: originalSourceId,
      type: 'in',
      amount: originalAmount,
      balanceAfter: newSourceBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      description: `عكس تحويل صادر: ${outTxDoc!.data.description}`,
      createdBy: createdBy,
      createdAt: now as unknown as Date,
    };

    const reverseInTxData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: originalDestId,
      type: 'out',
      amount: originalAmount,
      balanceAfter: newDestBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      description: `عكس تحويل وارد: ${inTxDoc!.data.description}`,
      createdBy: createdBy,
      createdAt: now as unknown as Date,
    };

    transaction.set(revOutTxRef, reverseOutTxData);
    transaction.set(revInTxRef, reverseInTxData);
    transaction.update(sourceCashboxRef, { balance: newSourceBalance, updatedAt: now as unknown as Date });
    transaction.update(destCashboxRef, { balance: newDestBalance, updatedAt: now as unknown as Date });
  });
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
