import { collection, doc, runTransaction, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FinancialTransaction, TransactionFlow, TransactionType, ReferenceType, TransactionStatus } from '../types';

const TRANSACTIONS_COLLECTION = 'financial_transactions';
const CASHBOXES_COLLECTION = 'cashboxes';

export interface ManualTransactionParams {
  cashboxId: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  description: string;
  createdBy: string;
}

export interface TransferParams {
  sourceCashboxId: string;
  destinationCashboxId: string;
  amount: number;
  description: string;
  createdBy: string;
}

export interface ReverseTransactionParams {
  originalTransactionId: string;
  reason: string;
  createdBy: string;
}

// 1. تنفيذ حركة يدوية (إيداع أو سحب)
export const processManualTransaction = async (params: ManualTransactionParams): Promise<void> => {
  // التحقق من صحة المبلغ والوصف
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error('يجب أن يكون المبلغ رقماً صالحاً وأكبر من صفر');
  }
  if (!params.description?.trim()) {
    throw new Error('يجب إدخال وصف أو سبب للحركة');
  }
  
  const cashboxRef = doc(db, CASHBOXES_COLLECTION, params.cashboxId);
  const transactionRef = doc(collection(db, TRANSACTIONS_COLLECTION)); 

  await runTransaction(db, async (transaction) => {
    const cashboxDoc = await transaction.get(cashboxRef);
    if (!cashboxDoc.exists()) throw new Error('الخزينة غير موجودة');

    const cashboxData = cashboxDoc.data();
    if (!cashboxData.isActive) throw new Error('لا يمكن تنفيذ حركة مالية على خزينة معطلة');

    const currentBalance = cashboxData.balance || 0;

    // منع الرصيد السالب في حالة السحب
    if (params.type === 'withdraw' && params.amount > currentBalance) {
      throw new Error('الرصيد الحالي غير كافٍ لإتمام عملية السحب');
    }

    const flow: TransactionFlow = params.type === 'deposit' ? 'in' : 'out';
    const newBalance = flow === 'in' ? currentBalance + params.amount : currentBalance - params.amount;
    
    // توحيد التوقيت لكل عمليات الدالة
    const now = Timestamp.now();

    const transactionData: Omit<FinancialTransaction, 'id'> = {
      cashboxId: params.cashboxId,
      type: params.type,
      flow,
      amount: params.amount,
      balanceAfter: newBalance,
      referenceType: 'manual',
      description: params.description.trim(),
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    transaction.set(transactionRef, transactionData);
    transaction.update(cashboxRef, { balance: newBalance, updatedAt: now });
  });
};

// 2. تنفيذ تحويل بين خزنتين (Transfer)
export const processTransfer = async (params: TransferParams): Promise<void> => {
  // التحقق من صحة المبلغ
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error('يجب أن يكون مبلغ التحويل رقماً صالحاً وأكبر من صفر');
  }
  if (params.sourceCashboxId === params.destinationCashboxId) {
    throw new Error('لا يمكن التحويل من الخزينة إلى نفسها');
  }

  const sourceRef = doc(db, CASHBOXES_COLLECTION, params.sourceCashboxId);
  const destRef = doc(db, CASHBOXES_COLLECTION, params.destinationCashboxId);
  
  const transferOutRef = doc(collection(db, TRANSACTIONS_COLLECTION));
  const transferInRef = doc(collection(db, TRANSACTIONS_COLLECTION));
  const sharedTransferId = transferOutRef.id; 

  await runTransaction(db, async (transaction) => {
    const sourceDoc = await transaction.get(sourceRef);
    const destDoc = await transaction.get(destRef);

    if (!sourceDoc.exists()) throw new Error('الخزينة المصدر غير موجودة');
    if (!destDoc.exists()) throw new Error('الخزينة المستقبلة غير موجودة');

    const sourceData = sourceDoc.data();
    const destData = destDoc.data();

    if (!sourceData.isActive) throw new Error('الخزينة المصدر معطلة');
    if (!destData.isActive) throw new Error('الخزينة المستقبلة معطلة');

    const sourceCurrentBalance = sourceData.balance || 0;
    const destCurrentBalance = destData.balance || 0;

    // منع الرصيد السالب في الخزينة المصدر
    if (params.amount > sourceCurrentBalance) {
      throw new Error('رصيد الخزينة المصدر غير كافٍ لإتمام التحويل');
    }

    const sourceNewBalance = sourceCurrentBalance - params.amount;
    const destNewBalance = destCurrentBalance + params.amount;
    
    // توحيد التوقيت
    const now = Timestamp.now();

    // معالجة الوصف (إذا لم يكتب المستخدم وصفاً، نستخدم الافتراضي)
    const outDescription = params.description?.trim() || `تحويل صادر إلى: ${destData.name}`;
    const inDescription = params.description?.trim() || `تحويل وارد من: ${sourceData.name}`;

    const transferOutData: Omit<FinancialTransaction, 'id'> = {
      cashboxId: params.sourceCashboxId,
      type: 'transfer_out',
      flow: 'out',
      amount: params.amount,
      balanceAfter: sourceNewBalance,
      referenceType: 'transfer',
      referenceId: sharedTransferId,
      transferId: sharedTransferId,
      description: outDescription,
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    const transferInData: Omit<FinancialTransaction, 'id'> = {
      cashboxId: params.destinationCashboxId,
      type: 'transfer_in',
      flow: 'in',
      amount: params.amount,
      balanceAfter: destNewBalance,
      referenceType: 'transfer',
      referenceId: sharedTransferId,
      transferId: sharedTransferId,
      description: inDescription,
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    transaction.set(transferOutRef, transferOutData);
    transaction.set(transferInRef, transferInData);
    
    transaction.update(sourceRef, { balance: sourceNewBalance, updatedAt: now });
    transaction.update(destRef, { balance: destNewBalance, updatedAt: now });
  });
};

// 3. إلغاء/عكس حركة مالية (Reverse Transaction)
export const reverseTransaction = async (params: ReverseTransactionParams): Promise<void> => {
  // التحقق من صحة سبب الإلغاء
  if (!params.reason?.trim()) {
    throw new Error('يجب إدخال سبب لإلغاء أو تصحيح الحركة');
  }

  const originalTxRef = doc(db, TRANSACTIONS_COLLECTION, params.originalTransactionId);
  const reverseTxRef = doc(collection(db, TRANSACTIONS_COLLECTION));

  await runTransaction(db, async (transaction) => {
    const originalTxDoc = await transaction.get(originalTxRef);
    if (!originalTxDoc.exists()) throw new Error('الحركة المالية الأصلية غير موجودة');
    
    const originalTx = originalTxDoc.data() as FinancialTransaction;

    // حمايات العكس
    if (originalTx.status === 'reversed') throw new Error('لا يمكن عكس حركة تم إلغاؤها مسبقاً');
    if (originalTx.type === 'reverse') throw new Error('لا يمكن عكس حركة عكسية (تصحيحية)');
    if (originalTx.type === 'transfer_in' || originalTx.type === 'transfer_out') {
      throw new Error('لا يمكن عكس حركة تحويل منفردة. يرجى إنشاء تحويل عكسي بين الخزنتين.');
    }

    const cashboxRef = doc(db, CASHBOXES_COLLECTION, originalTx.cashboxId);
    const cashboxDoc = await transaction.get(cashboxRef);
    
    if (!cashboxDoc.exists()) throw new Error('الخزينة المرتبطة غير موجودة');
    if (!cashboxDoc.data().isActive) throw new Error('لا يمكن تصحيح حركة لخزينة معطلة');

    const currentBalance = cashboxDoc.data().balance || 0;
    
    // إذا كانت الحركة الأصلية دخول، فالعكس خروج (والعكس صحيح)
    const reverseFlow: TransactionFlow = originalTx.flow === 'in' ? 'out' : 'in';

    // منع الرصيد السالب إذا كان التصحيح سيؤدي لسحب نقود
    if (reverseFlow === 'out' && originalTx.amount > currentBalance) {
      throw new Error('الرصيد الحالي للخزينة غير كافٍ لعكس هذه الحركة (سيؤدي لرصيد سالب)');
    }

    const newBalance = reverseFlow === 'in' 
      ? currentBalance + originalTx.amount 
      : currentBalance - originalTx.amount;

    const now = Timestamp.now();

    const reverseTxData: Omit<FinancialTransaction, 'id'> = {
      cashboxId: originalTx.cashboxId,
      type: 'reverse',
      flow: reverseFlow,
      amount: originalTx.amount,
      balanceAfter: newBalance,
      referenceType: 'correction',
      referenceId: originalTxDoc.id, 
      description: `تسوية وإلغاء لحركة سابقة: ${params.reason.trim()}`,
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    // 1. إنشاء الحركة التصحيحية
    transaction.set(reverseTxRef, reverseTxData);
    
    // 2. تحديث الحركة الأصلية (تغيير الحالة فقط وتوثيق من عكسها)
    transaction.update(originalTxRef, { 
      status: 'reversed',
      reversedByTransactionId: reverseTxRef.id,
      updatedAt: now
    });

    // 3. تحديث الكاش الخاص بالرصيد في الخزينة
    transaction.update(cashboxRef, { balance: newBalance, updatedAt: now });
  });
};

// 4. جلب كشف حساب لخزينة معينة
export const getCashboxLedger = async (cashboxId: string): Promise<FinancialTransaction[]> => {
  try {
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
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as FinancialTransaction;
    });
  } catch (error) {
    console.error('خطأ أثناء جلب كشف حساب الخزينة:', error);
    throw error;
  }
};
