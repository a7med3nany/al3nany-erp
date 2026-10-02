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

export interface ReverseTransferParams {
  transferId: string;
  reason: string;
  createdBy: string;
}

// 1. تنفيذ حركة يدوية (إيداع أو سحب)
export const processManualTransaction = async (params: ManualTransactionParams): Promise<void> => {
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
    // يمنع الإيداع أو السحب الجديد إذا كانت الخزينة معطلة
    if (!cashboxData.isActive) throw new Error('لا يمكن تنفيذ حركة مالية جديدة على خزينة معطلة');

    const currentBalance = cashboxData.balance || 0;

    if (params.type === 'withdraw' && params.amount > currentBalance) {
      throw new Error('الرصيد الحالي غير كافٍ لإتمام عملية السحب');
    }

    const flow: TransactionFlow = params.type === 'deposit' ? 'in' : 'out';
    const newBalance = flow === 'in' ? currentBalance + params.amount : currentBalance - params.amount;
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

    // يمنع التحويل الجديد إذا كان أحد الأطراف معطلاً
    if (!sourceData.isActive) throw new Error('الخزينة المصدر معطلة');
    if (!destData.isActive) throw new Error('الخزينة المستقبلة معطلة');

    const sourceCurrentBalance = sourceData.balance || 0;
    const destCurrentBalance = destData.balance || 0;

    if (params.amount > sourceCurrentBalance) {
      throw new Error('رصيد الخزينة المصدر غير كافٍ لإتمام التحويل');
    }

    const sourceNewBalance = sourceCurrentBalance - params.amount;
    const destNewBalance = destCurrentBalance + params.amount;
    const now = Timestamp.now();

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
      counterpartCashboxId: params.destinationCashboxId,
      counterpartCashboxName: destData.name,
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
      counterpartCashboxId: params.sourceCashboxId,
      counterpartCashboxName: sourceData.name,
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

// 3. إلغاء/عكس حركة مالية يدوية (Reverse Transaction)
export const reverseTransaction = async (params: ReverseTransactionParams): Promise<void> => {
  if (!params.reason?.trim()) throw new Error('يجب إدخال سبب لإلغاء أو تصحيح الحركة');

  const originalTxRef = doc(db, TRANSACTIONS_COLLECTION, params.originalTransactionId);
  const reverseTxRef = doc(collection(db, TRANSACTIONS_COLLECTION));

  await runTransaction(db, async (transaction) => {
    const originalTxDoc = await transaction.get(originalTxRef);
    if (!originalTxDoc.exists()) throw new Error('الحركة المالية الأصلية غير موجودة');
    
    const originalTx = originalTxDoc.data() as FinancialTransaction;

    if (originalTx.status === 'reversed') throw new Error('لا يمكن عكس حركة تم إلغاؤها مسبقاً');
    if (originalTx.type === 'reverse') throw new Error('لا يمكن عكس حركة عكسية (تصحيحية)');
    if (originalTx.type === 'transfer_in' || originalTx.type === 'transfer_out') {
      throw new Error('لا يمكن عكس حركة تحويل منفردة. يرجى استخدام التحويل العكسي.');
    }

    const cashboxRef = doc(db, CASHBOXES_COLLECTION, originalTx.cashboxId);
    const cashboxDoc = await transaction.get(cashboxRef);
    
    if (!cashboxDoc.exists()) throw new Error('الخزينة المرتبطة غير موجودة');
    
    // ملاحظة محاسبية: لا نتحقق هنا من isActive لأننا نسمح بتصحيح العمليات حتى للخزائن المعطلة
    
    const currentBalance = cashboxDoc.data().balance || 0;
    const reverseFlow: TransactionFlow = originalTx.flow === 'in' ? 'out' : 'in';

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

    transaction.set(reverseTxRef, reverseTxData);
    transaction.update(originalTxRef, { status: 'reversed', reversedByTransactionId: reverseTxRef.id, updatedAt: now });
    transaction.update(cashboxRef, { balance: newBalance, updatedAt: now });
  });
};

// 4. التحويل العكسي (Atomic Transfer Reversal)
export const reverseTransfer = async (params: ReverseTransferParams): Promise<void> => {
  if (!params.reason?.trim()) throw new Error('يجب إدخال سبب لإلغاء التحويل');

  // الاستعلام المسبق لجلب الحركتين المرتبطتين بنفس التحويل
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('transferId', '==', params.transferId),
    where('referenceType', '==', 'transfer'),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(q);

  if (snapshot.size !== 2) {
    throw new Error('لا يمكن عكس هذا التحويل، إما أنه تم إلغاؤه مسبقاً أو بياناته غير مكتملة.');
  }

  const docRef1 = doc(db, TRANSACTIONS_COLLECTION, snapshot.docs[0].id);
  const docRef2 = doc(db, TRANSACTIONS_COLLECTION, snapshot.docs[1].id);

  await runTransaction(db, async (transaction) => {
    // 1. قراءة بيانات الحركتين الأصلية بشكل متزامن
    const txDoc1 = await transaction.get(docRef1);
    const txDoc2 = await transaction.get(docRef2);

    if (!txDoc1.exists() || !txDoc2.exists()) throw new Error('أحد حركات التحويل غير موجودة');

    const tx1 = txDoc1.data() as FinancialTransaction;
    const tx2 = txDoc2.data() as FinancialTransaction;

    if (tx1.status === 'reversed' || tx2.status === 'reversed') throw new Error('تم عكس هذا التحويل مسبقاً');

    // تصنيف الحركات (أيها الدخول وأيها الخروج)
    const transferOutDoc = tx1.type === 'transfer_out' ? txDoc1 : (tx2.type === 'transfer_out' ? txDoc2 : null);
    const transferInDoc = tx1.type === 'transfer_in' ? txDoc1 : (tx2.type === 'transfer_in' ? txDoc2 : null);

    if (!transferOutDoc || !transferInDoc) throw new Error('بيانات التحويل غير صالحة ولا تحتوي على طرفي النقل');

    const transferOutData = transferOutDoc.data() as FinancialTransaction;
    const transferInData = transferInDoc.data() as FinancialTransaction;

    // 2. قراءة بيانات الخزائن الأصلية
    const originalSourceRef = doc(db, CASHBOXES_COLLECTION, transferOutData.cashboxId);
    const originalDestRef = doc(db, CASHBOXES_COLLECTION, transferInData.cashboxId);

    const sourceDoc = await transaction.get(originalSourceRef);
    const destDoc = await transaction.get(originalDestRef);

    if (!sourceDoc.exists()) throw new Error('الخزينة المصدر الأساسية غير موجودة');
    if (!destDoc.exists()) throw new Error('الخزينة المستقبلة الأساسية غير موجودة');

    // ملاحظة: لا نفحص isActive هنا لضمان إمكانية التصحيح دائماً
    
    const sourceBalance = sourceDoc.data().balance || 0;
    const destBalance = destDoc.data().balance || 0;

    // الخزينة المستقبلة (التي زاد رصيدها سابقاً) يجب أن تملك رصيداً كافياً الآن لسحب المبلغ وإرجاعه
    if (destBalance < transferInData.amount) {
      throw new Error(`رصيد خزينة "${destDoc.data().name}" غير كافٍ لاسترداد مبلغ التحويل.`);
    }

    const newSourceBalance = sourceBalance + transferOutData.amount;
    const newDestBalance = destBalance - transferInData.amount;
    const now = Timestamp.now();

    // 3. تجهيز بيانات الحركات العكسية
    const reverseInRef = doc(collection(db, TRANSACTIONS_COLLECTION)); // حركة دخول لرد الفلوس للمصدر الأساسي
    const reverseOutRef = doc(collection(db, TRANSACTIONS_COLLECTION)); // حركة خروج لسحب الفلوس من المستقبل الأساسي

    const reverseInTx: Omit<FinancialTransaction, 'id'> = {
      cashboxId: originalSourceRef.id,
      type: 'reverse',
      flow: 'in',
      amount: transferOutData.amount,
      balanceAfter: newSourceBalance,
      referenceType: 'correction',
      referenceId: transferOutDoc.id, // الإشارة لمعرف حركة الخروج الأصلية
      transferId: params.transferId,  // الاحتفاظ برقم التحويل الموحد
      counterpartCashboxId: originalDestRef.id,
      counterpartCashboxName: destDoc.data().name,
      description: `إلغاء تحويل صادر سابق: ${params.reason.trim()}`,
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    const reverseOutTx: Omit<FinancialTransaction, 'id'> = {
      cashboxId: originalDestRef.id,
      type: 'reverse',
      flow: 'out',
      amount: transferInData.amount,
      balanceAfter: newDestBalance,
      referenceType: 'correction',
      referenceId: transferInDoc.id, // الإشارة لمعرف حركة الدخول الأصلية
      transferId: params.transferId,
      counterpartCashboxId: originalSourceRef.id,
      counterpartCashboxName: sourceDoc.data().name,
      description: `إلغاء تحويل وارد سابق: ${params.reason.trim()}`,
      status: 'active',
      createdBy: params.createdBy,
      createdAt: now as unknown as Date,
      updatedAt: now as unknown as Date,
    };

    // 4. تنفيذ العمليات بشكل متزامن
    transaction.set(reverseInRef, reverseInTx);
    transaction.set(reverseOutRef, reverseOutTx);
    
    transaction.update(transferOutDoc.ref, { status: 'reversed', reversedByTransactionId: reverseInRef.id, updatedAt: now });
    transaction.update(transferInDoc.ref, { status: 'reversed', reversedByTransactionId: reverseOutRef.id, updatedAt: now });
    
    transaction.update(originalSourceRef, { balance: newSourceBalance, updatedAt: now });
    transaction.update(originalDestRef, { balance: newDestBalance, updatedAt: now });
  });
};

// 5. جلب كشف حساب لخزينة معينة
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
