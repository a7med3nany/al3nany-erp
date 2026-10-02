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

  // حماية Idempotency مع مطابقة البيانات
  if (transactionSnap.exists()) {
    const existingData = transactionSnap.data() as CashboxTransaction;
    const refType = params.referenceType || 'manual';
    const refId = params.referenceId || generatedId;

    if (
      existingData.cashboxId === params.cashboxId &&
      existingData.type === params.type &&
      existingData.amount === params.amount &&
      existingData.referenceType === refType &&
      existingData.referenceId === refId
    ) {
      return; // Idempotent Success
    } else {
      throw new Error("معرف المعاملة مستخدم بالفعل لعملية مختلفة.");
    }
  }

  if (!cashboxSnap.exists()) {
    throw new Error(`الخزينة المطلوبة غير موجودة (${params.cashboxId})`);
  }

  const cashboxData = cashboxSnap.data() as Cashbox;
  
  if (cashboxData.isActive === false) {
    throw new Error(`لا يمكن إجراء عمليات مالية على خزينة غير نشطة (${cashboxData.name})`);
  }

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

  // حماية Idempotency الصارمة مع مطابقة البيانات
  if (outExists && inExists) {
    const outData = outSnap.data() as CashboxTransaction;
    const inData = inSnap.data() as CashboxTransaction;

    if (
      outData.type === 'out' &&
      outData.cashboxId === params.sourceCashboxId &&
      outData.amount === params.amount &&
      outData.referenceType === 'transfer' &&
      outData.referenceId === transferId &&
      outData.counterpartCashboxId === params.destCashboxId &&
      inData.type === 'in' &&
      inData.cashboxId === params.destCashboxId &&
      inData.amount === params.amount &&
      inData.referenceType === 'transfer' &&
      inData.referenceId === transferId &&
      inData.counterpartCashboxId === params.sourceCashboxId
    ) {
      return; // Idempotent Success
    } else {
      throw new Error("معرف التحويل مستخدم بالفعل لعملية تحويل مختلفة.");
    }
  }
  
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
    throw new Error(`رصيد الخزينة المصدر غير كافٍ للتحويل. المتاح: ${sourceBalance}`);
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
    counterpartCashboxId: params.destCashboxId,
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
    counterpartCashboxId: params.sourceCashboxId,
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
  if (transactionId.startsWith('rev_')) {
    throw new Error("لا يمكن عكس معاملة تمثل عملية عكس.");
  }

  await runTransaction(db, async (transaction) => {
    const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const txSnap = await transaction.get(txRef);
    
    if (!txSnap.exists()) throw new Error("المعاملة الأصلية غير موجودة.");

    const txData = txSnap.data() as CashboxTransaction;
    
    if (txData.referenceType === 'transfer') {
      throw new Error("هذه الحركة جزء من تحويل مالي. يرجى استخدام وظيفة عكس التحويل المخصصة.");
    }

    const cashboxRef = doc(db, CASHBOXES_COLLECTION, txData.cashboxId);
    const cashboxSnap = await transaction.get(cashboxRef);
    if (!cashboxSnap.exists()) throw new Error("الخزينة المرتبطة بهذه المعاملة غير موجودة.");

    const cashboxData = cashboxSnap.data() as Cashbox;
    
    if (cashboxData.isActive === false) throw new Error("لا يمكن إلغاء معاملة لخزينة غير نشطة.");

    const currentBalance = cashboxData.balance;
    const reverseType: TransactionType = txData.type === 'in' ? 'out' : 'in';

    if (reverseType === 'out' && currentBalance < txData.amount) {
      throw new Error("رصيد الخزينة غير كافٍ لإلغاء هذه المعاملة (استرداد المبلغ سيؤدي لرصيد سالب).");
    }

    const newBalance = reverseType === 'in' ? currentBalance + txData.amount : currentBalance - txData.amount;
    const now = Timestamp.now();

    const revTxId = `rev_${transactionId}`;
    const revTxRef = doc(db, TRANSACTIONS_COLLECTION, revTxId);
    
    const revSnap = await transaction.get(revTxRef);
    if (revSnap.exists()) throw new Error("تم عكس هذه المعاملة مسبقاً.");

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

export const reverseTransfer = async (
  transferId: string,
  sourceCashboxId: string,
  destCashboxId: string,
  createdBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    // 1. بناء معرّفات المستندات الأصلية للتحويل
    const outRef = doc(db, TRANSACTIONS_COLLECTION, `${transferId}_out_${sourceCashboxId}`);
    const inRef = doc(db, TRANSACTIONS_COLLECTION, `${transferId}_in_${destCashboxId}`);
    
    const sourceCashboxRef = doc(db, CASHBOXES_COLLECTION, sourceCashboxId);
    const destCashboxRef = doc(db, CASHBOXES_COLLECTION, destCashboxId);

    // 2. بناء معرّفات مستندات العكس
    const revInForSourceRef = doc(db, TRANSACTIONS_COLLECTION, `rev_${transferId}_in_${sourceCashboxId}`);
    const revOutForDestRef = doc(db, TRANSACTIONS_COLLECTION, `rev_${transferId}_out_${destCashboxId}`);

    // 3. قراءة جميع المستندات معاً قبل أي كتابة
    const [outSnap, inSnap, sourceSnap, destSnap, revInSnap, revOutSnap] = await Promise.all([
      transaction.get(outRef),
      transaction.get(inRef),
      transaction.get(sourceCashboxRef),
      transaction.get(destCashboxRef),
      transaction.get(revInForSourceRef),
      transaction.get(revOutForDestRef)
    ]);

    // 4. التحقق من حالة العكس (منع العكس الجزئي والمزدوج)
    const revInExists = revInSnap.exists();
    const revOutExists = revOutSnap.exists();

    if (revInExists && revOutExists) {
      throw new Error("تم عكس هذا التحويل مسبقاً.");
    }
    if (revInExists !== revOutExists) {
      throw new Error("حالة عكس التحويل غير متسقة.");
    }

    // 5. التحقق من وجود الحركات الأصلية
    if (!outSnap.exists() || !inSnap.exists()) {
      throw new Error("الحركات الأصلية للتحويل غير موجودة.");
    }

    const outData = outSnap.data() as CashboxTransaction;
    const inData = inSnap.data() as CashboxTransaction;

    // 6. التحقق من الخصائص الدقيقة للحركات الأصلية
    if (outData.type !== 'out' || inData.type !== 'in') {
      throw new Error("أنواع الحركات الأصلية للتحويل غير صحيحة.");
    }
    if (outData.referenceType !== 'transfer' || inData.referenceType !== 'transfer') {
      throw new Error("نوع المرجع للحركات الأصلية ليس تحويلاً.");
    }
    if (outData.referenceId !== transferId || inData.referenceId !== transferId) {
      throw new Error("معرف التحويل غير متطابق في الحركات الأصلية.");
    }
    if (outData.cashboxId !== sourceCashboxId || inData.cashboxId !== destCashboxId) {
      throw new Error("الخزائن غير متطابقة في الحركات الأصلية.");
    }
    if (outData.amount !== inData.amount) {
      throw new Error("مبلغ التحويل غير متطابق بين الحركتين الأصليتين.");
    }

    const originalAmount = outData.amount;

    // 7. التحقق من الخزائن
    if (!sourceSnap.exists() || !destSnap.exists()) {
      throw new Error("إحدى الخزائن المرتبطة بهذا التحويل غير موجودة.");
    }

    const sourceData = sourceSnap.data() as Cashbox;
    const destData = destSnap.data() as Cashbox;

    if (sourceData.isActive === false || destData.isActive === false) {
      throw new Error("لا يمكن عكس تحويل مرتبط بخزينة غير نشطة.");
    }

    // 8. حماية الرصيد
    if (destData.balance < originalAmount) {
      throw new Error(`رصيد الخزينة المستقبلة (${destData.name}) غير كافٍ لاسترجاع مبلغ التحويل.`);
    }

    // 9. تجهيز البيانات والتحديثات
    const newSourceBalance = Number((sourceData.balance + originalAmount).toFixed(4));
    const newDestBalance = Number((destData.balance - originalAmount).toFixed(4));
    const now = Timestamp.now();

    const reverseInForSourceData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: sourceCashboxId,
      type: 'in', // إرجاع المبلغ للمصدر
      amount: originalAmount,
      balanceAfter: newSourceBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      description: `عكس تحويل صادر: ${outData.description || ''}`,
      createdBy: createdBy,
      createdAt: now as unknown as Date,
    };

    const reverseOutForDestData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: destCashboxId,
      type: 'out', // سحب المبلغ من المستقبل
      amount: originalAmount,
      balanceAfter: newDestBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      description: `عكس تحويل وارد: ${inData.description || ''}`,
      createdBy: createdBy,
      createdAt: now as unknown as Date,
    };

    // 10. تنفيذ الكتابة الذرية
    transaction.set(revInForSourceRef, reverseInForSourceData);
    transaction.set(revOutForDestRef, reverseOutForDestData);
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
