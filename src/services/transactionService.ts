import {
  doc,
  collection,
  runTransaction,
  Timestamp,
  Transaction as FirestoreTransaction,
  getDocs,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  Cashbox,
  CashboxTransaction,
  FinancialReferenceType,
  TransactionType
} from '../types';

const CASHBOXES_COLLECTION = 'cashboxes';
const TRANSACTIONS_COLLECTION = 'cashbox_transactions';

// ==========================================
// 1. Interfaces & Types
// ==========================================

export interface PreparedManualTransaction {
  isIdempotent: boolean;
  transactionRef: any;
  transactionData?: Omit<CashboxTransaction, 'id'>;
  cashboxRef: any;
  cashboxUpdateData?: {
    balance: number;
    updatedAt: Date;
  };
}

export interface ManualTransactionParams {
  transactionId?: string;
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
  transferId?: string;
  description?: string;
  createdBy: string;
}

// ==========================================
// 2. Core Internal Transaction Methods
// ==========================================

export const prepareManualTransactionInTransaction = async (
  transaction: FirestoreTransaction,
  params: ManualTransactionParams,
  transactionId: string
): Promise<PreparedManualTransaction> => {
  const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnap = await transaction.get(txRef);

  if (txSnap.exists()) {
    const data = txSnap.data() as CashboxTransaction;
    const isMatch =
      data.cashboxId === params.cashboxId &&
      data.type === params.type &&
      data.amount === params.amount &&
      data.referenceType === params.referenceType &&
      data.referenceId === params.referenceId;

    if (!isMatch) {
      throw new Error("معرّف الحركة مستخدم مسبقاً لعملية ببيانات مختلفة.");
    }
    return { isIdempotent: true, transactionRef: txRef, cashboxRef: null };
  }

  const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);
  const cashboxSnap = await transaction.get(cashboxRef);

  if (!cashboxSnap.exists()) {
    throw new Error("الخزينة غير موجودة.");
  }

  const cashbox = cashboxSnap.data() as Cashbox;

  if (!cashbox.isActive) {
    throw new Error("الخزينة غير نشطة.");
  }

  if (params.amount <= 0 || isNaN(params.amount) || !isFinite(params.amount)) {
    throw new Error("مبلغ الحركة غير صالح ويجب أن يكون أكبر من صفر.");
  }

  let newBalance = cashbox.balance;

  if (params.type === 'out') {
    if (cashbox.balance < params.amount) {
      throw new Error(`رصيد الخزينة (${cashbox.name}) لا يكفي لإتمام الحركة.`);
    }
    newBalance -= params.amount;
  } else {
    newBalance += params.amount;
  }

  newBalance = Number(newBalance.toFixed(4));
  const now = Timestamp.now().toDate();

  return {
    isIdempotent: false,
    transactionRef: txRef,
    transactionData: {
      cashboxId: params.cashboxId,
      type: params.type,
      amount: params.amount,
      balanceAfter: newBalance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description,
      createdBy: params.createdBy,
      createdAt: now
    },
    cashboxRef,
    cashboxUpdateData: {
      balance: newBalance,
      updatedAt: now
    }
  };
};

export const commitManualTransactionInTransaction = (
  transaction: FirestoreTransaction,
  preparedTx: PreparedManualTransaction
): void => {
  if (preparedTx.isIdempotent) return;
  transaction.update(preparedTx.cashboxRef, preparedTx.cashboxUpdateData!);
  transaction.set(preparedTx.transactionRef, preparedTx.transactionData!);
};

export const processManualTransactionInTransaction = async (
  transaction: FirestoreTransaction,
  params: ManualTransactionParams
): Promise<void> => {
  const txId = params.transactionId || `tx_${params.referenceType}_${params.referenceId}_${params.cashboxId}`;
  const preparedTx = await prepareManualTransactionInTransaction(transaction, params, txId);
  commitManualTransactionInTransaction(transaction, preparedTx);
};

export const processTransferInTransaction = async (
  transaction: FirestoreTransaction,
  params: TransferOperationParams
): Promise<void> => {
  if (params.sourceCashboxId === params.destCashboxId) {
    throw new Error("لا يمكن التحويل لنفس الخزينة.");
  }

  if (params.amount <= 0 || isNaN(params.amount) || !isFinite(params.amount)) {
    throw new Error("مبلغ التحويل غير صالح ويجب أن يكون أكبر من صفر.");
  }

  const transferId = params.transferId || `trans_${params.sourceCashboxId}_${params.destCashboxId}_${params.amount}`;
  const outId = `${transferId}_out_${params.sourceCashboxId}`;
  const inId = `${transferId}_in_${params.destCashboxId}`;

  const outRef = doc(db, TRANSACTIONS_COLLECTION, outId);
  const inRef = doc(db, TRANSACTIONS_COLLECTION, inId);

  const outSnap = await transaction.get(outRef);
  const inSnap = await transaction.get(inRef);

  if (outSnap.exists() && inSnap.exists()) {
    const outData = outSnap.data() as CashboxTransaction;
    const inData = inSnap.data() as CashboxTransaction;

    const isMatch =
      outData.cashboxId === params.sourceCashboxId &&
      outData.type === 'out' &&
      outData.amount === params.amount &&
      outData.referenceType === 'transfer' &&
      outData.referenceId === transferId &&
      outData.counterpartCashboxId === params.destCashboxId &&
      inData.cashboxId === params.destCashboxId &&
      inData.type === 'in' &&
      inData.amount === params.amount &&
      inData.referenceType === 'transfer' &&
      inData.referenceId === transferId &&
      inData.counterpartCashboxId === params.sourceCashboxId;

    if (isMatch) return; // Idempotent success
    throw new Error("معرّف التحويل مستخدم مسبقاً لعملية ببيانات مختلفة.");
  }

  if (outSnap.exists() || inSnap.exists()) {
    throw new Error("حالة التحويل غير متسقة.");
  }

  const sourceRef = doc(db, CASHBOXES_COLLECTION, params.sourceCashboxId);
  const destRef = doc(db, CASHBOXES_COLLECTION, params.destCashboxId);

  const sourceSnap = await transaction.get(sourceRef);
  const destSnap = await transaction.get(destRef);

  if (!sourceSnap.exists()) throw new Error("الخزينة المصدر غير موجودة.");
  if (!destSnap.exists()) throw new Error("الخزينة المستقبلة غير موجودة.");

  const sourceCashbox = sourceSnap.data() as Cashbox;
  const destCashbox = destSnap.data() as Cashbox;

  if (!sourceCashbox.isActive || !destCashbox.isActive) {
    throw new Error("إحدى الخزائن المحددة غير نشطة.");
  }

  if (sourceCashbox.balance < params.amount) {
    throw new Error("رصيد الخزينة المصدر لا يكفي لإتمام التحويل.");
  }

  const newSourceBalance = Number((sourceCashbox.balance - params.amount).toFixed(4));
  const newDestBalance = Number((destCashbox.balance + params.amount).toFixed(4));

  const now = Timestamp.now().toDate();

  const outData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.sourceCashboxId,
    type: 'out',
    amount: params.amount,
    balanceAfter: newSourceBalance,
    referenceType: 'transfer',
    referenceId: transferId,
    counterpartCashboxId: params.destCashboxId,
    description: params.description || `تحويل إلى خزينة`,
    createdBy: params.createdBy,
    createdAt: now
  };

  const inData: Omit<CashboxTransaction, 'id'> = {
    cashboxId: params.destCashboxId,
    type: 'in',
    amount: params.amount,
    balanceAfter: newDestBalance,
    referenceType: 'transfer',
    referenceId: transferId,
    counterpartCashboxId: params.sourceCashboxId,
    description: params.description || `تحويل من خزينة`,
    createdBy: params.createdBy,
    createdAt: now
  };

  transaction.update(sourceRef, { balance: newSourceBalance, updatedAt: now });
  transaction.update(destRef, { balance: newDestBalance, updatedAt: now });
  transaction.set(outRef, outData);
  transaction.set(inRef, inData);
};

// ==========================================
// 3. Standalone Service Methods
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

export const reverseTransfer = async (
  transferId: string,
  sourceCashboxId: string,
  destCashboxId: string,
  createdBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    // 1. Query Original Transactions
    const txQuery = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('referenceId', '==', transferId),
      where('referenceType', '==', 'transfer')
    );
    const querySnapshot = await transaction.get(txQuery);

    if (querySnapshot.empty) {
      throw new Error("لم يتم العثور على حركات هذا التحويل.");
    }

    const expectedOutId = `${transferId}_out_${sourceCashboxId}`;
    const expectedInId = `${transferId}_in_${destCashboxId}`;

    let outTx: CashboxTransaction | null = null;
    let inTx: CashboxTransaction | null = null;

    querySnapshot.forEach((docSnap) => {
      if (docSnap.id === expectedOutId) {
        outTx = docSnap.data() as CashboxTransaction;
      }
      if (docSnap.id === expectedInId) {
        inTx = docSnap.data() as CashboxTransaction;
      }
    });

    if (!outTx) {
      throw new Error("لم يتم العثور على حركة التحويل الصادرة الأصلية.");
    }
    if (!inTx) {
      throw new Error("لم يتم العثور على حركة التحويل الواردة الأصلية.");
    }

    if (outTx.type !== 'out' || inTx.type !== 'in') {
      throw new Error("أنواع الحركات الأصلية غير متطابقة مع المتوقع.");
    }

    if (outTx.referenceId !== transferId || inTx.referenceId !== transferId) {
      throw new Error("المرجع الخاص بالحركات لا يطابق مع معرف التحويل المطلوب.");
    }

    if (outTx.referenceType !== 'transfer' || inTx.referenceType !== 'transfer') {
      throw new Error("نوع المرجع للحركات الأصلية يجب أن يكون تحويل.");
    }

    if (outTx.cashboxId !== sourceCashboxId || inTx.cashboxId !== destCashboxId) {
      throw new Error("الخزائن المحددة غير متطابقة مع التحويل الأصلي.");
    }

    if (outTx.amount !== inTx.amount) {
      throw new Error("عدم تطابق في مبلغ التحويل بين الحركتين الأصليتين.");
    }

    const amount = outTx.amount;

    // 2. Read Cashboxes
    const sourceRef = doc(db, CASHBOXES_COLLECTION, sourceCashboxId);
    const destRef = doc(db, CASHBOXES_COLLECTION, destCashboxId);

    const sourceSnap = await transaction.get(sourceRef);
    const destSnap = await transaction.get(destRef);

    // 3. Read Reverse Documents
    const revInId = `rev_${transferId}_in_${sourceCashboxId}`;
    const revOutId = `rev_${transferId}_out_${destCashboxId}`;

    const revInRef = doc(db, TRANSACTIONS_COLLECTION, revInId);
    const revOutRef = doc(db, TRANSACTIONS_COLLECTION, revOutId);

    const revInSnap = await transaction.get(revInRef);
    const revOutSnap = await transaction.get(revOutRef);

    // 4. Validate all conditions
    if (!sourceSnap.exists() || !destSnap.exists()) {
      throw new Error("إحدى الخزائن المرتبطة بهذا التحويل غير موجودة.");
    }

    const sourceCashbox = sourceSnap.data() as Cashbox;
    const destCashbox = destSnap.data() as Cashbox;

    if (!sourceCashbox.isActive || !destCashbox.isActive) {
      throw new Error("إحدى الخزائن المحددة غير نشطة.");
    }

    // Verify reverse documents logic and consistency
    if (revInSnap.exists() && revOutSnap.exists()) {
      const revInData = revInSnap.data() as CashboxTransaction;
      const revOutData = revOutSnap.data() as CashboxTransaction;

      const isRevInMatch =
        revInData.cashboxId === sourceCashboxId &&
        revInData.type === 'in' &&
        revInData.amount === amount &&
        revInData.referenceType === 'transfer' &&
        revInData.referenceId === `rev_${transferId}` &&
        revInData.counterpartCashboxId === destCashboxId;

      const isRevOutMatch =
        revOutData.cashboxId === destCashboxId &&
        revOutData.type === 'out' &&
        revOutData.amount === amount &&
        revOutData.referenceType === 'transfer' &&
        revOutData.referenceId === `rev_${transferId}` &&
        revOutData.counterpartCashboxId === sourceCashboxId;

      if (isRevInMatch && isRevOutMatch) {
        throw new Error("تم عكس هذا التحويل مسبقاً.");
      } else {
        throw new Error("حالة عكس التحويل غير متسقة.");
      }
    } else if (revInSnap.exists() || revOutSnap.exists()) {
      throw new Error("حالة عكس التحويل غير متسقة.");
    }

    // Notice we are reversing the transfer: source gets `+ amount`, dest gets `- amount`
    if (destCashbox.balance < amount) {
      throw new Error("رصيد الخزنة المستقبلة لا يكفي لعكس التحويل (الرصيد سيصبح سالباً).");
    }

    // 5. Prepare Writes
    const newSourceBalance = Number((sourceCashbox.balance + amount).toFixed(4));
    const newDestBalance = Number((destCashbox.balance - amount).toFixed(4));

    const now = Timestamp.now().toDate();

    const revInData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: sourceCashboxId,
      type: 'in',
      amount: amount,
      balanceAfter: newSourceBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      counterpartCashboxId: destCashboxId,
      description: `عكس تحويل صادر (رقم: ${transferId})`,
      createdBy: createdBy,
      createdAt: now
    };

    const revOutData: Omit<CashboxTransaction, 'id'> = {
      cashboxId: destCashboxId,
      type: 'out',
      amount: amount,
      balanceAfter: newDestBalance,
      referenceType: 'transfer',
      referenceId: `rev_${transferId}`,
      counterpartCashboxId: sourceCashboxId,
      description: `عكس تحويل وارد (رقم: ${transferId})`,
      createdBy: createdBy,
      createdAt: now
    };

    // 6. Execute Writes
    transaction.update(sourceRef, { balance: newSourceBalance, updatedAt: now });
    transaction.update(destRef, { balance: newDestBalance, updatedAt: now });

    transaction.set(revInRef, revInData);
    transaction.set(revOutRef, revOutData);
  });
};

export const reverseTransaction = async (transactionId: string, createdBy: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    if (transactionId.startsWith('rev_')) {
      throw new Error("لا يمكن عكس معاملة تمثل عملية عكس.");
    }

    const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const txSnap = await transaction.get(txRef);

    if (!txSnap.exists()) {
      throw new Error("المعاملة الأصلية غير موجودة.");
    }

    const txData = txSnap.data() as CashboxTransaction;

    if (txData.referenceId && txData.referenceId.startsWith('rev_')) {
      throw new Error("لا يمكن عكس معاملة تمثل عملية عكس.");
    }

    if (txData.referenceType === 'transfer') {
      throw new Error("لا يمكن عكس حركة تحويل مباشرة. استخدم ميزة عكس التحويل.");
    }

    const reverseType = txData.type === 'in' ? 'out' : 'in';

    const revId = `rev_${transactionId}`;
    const revRef = doc(db, TRANSACTIONS_COLLECTION, revId);
    const revSnap = await transaction.get(revRef);

    if (revSnap.exists()) {
      const revData = revSnap.data() as CashboxTransaction;
      const isMatch =
        revData.cashboxId === txData.cashboxId &&
        revData.type === reverseType &&
        revData.amount === txData.amount &&
        revData.referenceType === txData.referenceType &&
        revData.referenceId === `rev_${txData.referenceId}`;

      if (isMatch) {
        return; // Idempotent success
      } else {
        throw new Error("حالة عكس المعاملة غير متسقة.");
      }
    }

    const cashboxRef = doc(db, CASHBOXES_COLLECTION, txData.cashboxId);
    const cashboxSnap = await transaction.get(cashboxRef);

    if (!cashboxSnap.exists()) {
      throw new Error("الخزينة المرتبطة بهذه المعاملة غير موجودة.");
    }

    const cashbox = cashboxSnap.data() as Cashbox;

    if (!cashbox.isActive) {
      throw new Error("الخزينة المرتبطة غير نشطة.");
    }

    let newBalance = cashbox.balance;

    if (reverseType === 'out') {
      if (cashbox.balance < txData.amount) {
        throw new Error("رصيد الخزينة لا يكفي لعكس هذه المعاملة (الرصيد سيصبح سالباً).");
      }
      newBalance -= txData.amount;
    } else {
      newBalance += txData.amount;
    }

    newBalance = Number(newBalance.toFixed(4));
    const now = Timestamp.now().toDate();

    const revTx: Omit<CashboxTransaction, 'id'> = {
      cashboxId: txData.cashboxId,
      type: reverseType,
      amount: txData.amount,
      balanceAfter: newBalance,
      referenceType: txData.referenceType,
      referenceId: `rev_${txData.referenceId}`,
      description: `عكس معاملة سابقة (رقم: ${transactionId})`,
      createdBy: createdBy,
      createdAt: now
    };

    transaction.update(cashboxRef, { balance: newBalance, updatedAt: now });
    transaction.set(revRef, revTx);
  });
};

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
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date()
    } as CashboxTransaction;
  });
};
