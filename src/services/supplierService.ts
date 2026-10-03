import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  Transaction as FirestoreTransaction,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  Supplier, 
  SupplierTransaction, 
  FinancialReferenceType, 
  TransactionType 
} from '../types';

const SUPPLIERS_COLLECTION = 'suppliers';
const SUPPLIER_TX_COLLECTION = 'supplier_transactions';

// ==========================================
// 1. Data Interfaces
// ==========================================

export interface CreateSupplierParams {
  name: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSupplierParams {
  name?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface SupplierTransactionParams {
  supplierId: string;
  type: TransactionType;
  amount: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  description: string;
  createdBy: string;
}

export interface PreparedSupplierTransaction {
  isIdempotent: boolean;
  transactionRef: any;
  transactionData?: Omit<SupplierTransaction, 'id'>;
  supplierRef: any;
  supplierUpdateData?: { balance: number; updatedAt: Date };
}

// Validation Helper
const validateAmount = (val: number) => {
  if (!Number.isFinite(val) || Number.isNaN(val) || val <= 0) {
    throw new Error('قيمة المعاملة غير صالحة: يجب أن تكون رقماً أكبر من الصفر');
  }
};

// ==========================================
// 2. Transaction-Aware Internal Functions (Read / Prepare Phase)
// ==========================================

/**
 * دالة القراءة والتجهيز لمعالجة حركة مالية للمورد.
 * تقوم بتنفيذ القراءات وحساب الأرصدة وإرجاع كائن جاهز لمرحلة الكتابة.
 */
export const prepareSupplierTransactionInTransaction = async (
  transaction: FirestoreTransaction,
  params: SupplierTransactionParams,
  generatedTxId: string
): Promise<PreparedSupplierTransaction> => {
  if (!params.supplierId) throw new Error("معرف المورد مفقود");
  if (params.type !== 'in' && params.type !== 'out') {
    throw new Error(`نوع العملية غير صالح: ${params.type}. يجب أن يكون 'in' أو 'out' فقط.`);
  }
  
  validateAmount(params.amount);

  const transactionRef = doc(db, SUPPLIER_TX_COLLECTION, generatedTxId);
  const supplierRef = doc(db, SUPPLIERS_COLLECTION, params.supplierId);

  // قراءة متسلسلة داخل Transaction لضمان الأمان
  const transactionSnap = await transaction.get(transactionRef);
  const supplierSnap = await transaction.get(supplierRef);

  // Idempotency check: إذا كانت الحركة مسجلة بنفس المعرف، نتجاهل التنفيذ المزدوج
  if (transactionSnap.exists()) {
    const existingData = transactionSnap.data() as SupplierTransaction;
    if (
      existingData.supplierId === params.supplierId &&
      existingData.type === params.type &&
      existingData.amount === params.amount &&
      existingData.referenceType === params.referenceType &&
      existingData.referenceId === params.referenceId
    ) {
      return { isIdempotent: true, transactionRef, supplierRef }; // Idempotent Success
    } else {
      throw new Error("معرف معاملة المورد مستخدم بالفعل لعملية مختلفة.");
    }
  }

  if (!supplierSnap.exists()) {
    throw new Error(`المورد المطلوب غير موجود (${params.supplierId})`);
  }

  const supplierData = supplierSnap.data() as Supplier;
  
  if (supplierData.isActive === false) {
    throw new Error(`لا يمكن إجراء عمليات مالية على مورد غير نشط (${supplierData.name})`);
  }

  // الحساب المالي للمورد
  const currentBalance = Number.isFinite(supplierData.balance) ? supplierData.balance : 0;
  let newBalance = currentBalance;

  if (params.type === 'in') {
    // in = زيادة التزامنا/مديونيتنا للمورد (مثل شراء آجل)
    newBalance += params.amount;
  } else {
    // out = تقليل مديونيتنا (مثل سداد نقدي للمورد أو إرجاع بضاعة)
    newBalance -= params.amount;
  }
  
  newBalance = Number(newBalance.toFixed(4));
  const now = Timestamp.now();

  const transactionData: Omit<SupplierTransaction, 'id'> = {
    supplierId: params.supplierId,
    type: params.type,
    amount: params.amount,
    balanceAfter: newBalance,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    description: params.description || '',
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
  };

  const supplierUpdateData = { balance: newBalance, updatedAt: now as unknown as Date };

  return {
    isIdempotent: false,
    transactionRef,
    transactionData,
    supplierRef,
    supplierUpdateData
  };
};

// ==========================================
// 3. Transaction-Aware Internal Functions (Write Phase)
// ==========================================

/**
 * دالة الكتابة لمعالجة حركة مالية للمورد.
 * مسؤولة عن عمليات transaction.set و transaction.update فقط.
 */
export const commitSupplierTransactionInTransaction = (
  transaction: FirestoreTransaction,
  prepared: PreparedSupplierTransaction
): void => {
  if (prepared.isIdempotent) return;
  
  if (prepared.transactionData && prepared.supplierUpdateData) {
    transaction.set(prepared.transactionRef, prepared.transactionData);
    transaction.update(prepared.supplierRef, prepared.supplierUpdateData);
  }
};

// ==========================================
// 4. Transaction-Aware Combined Execution (Backward Compatibility)
// ==========================================

/**
 * دالة توافقية تجمع بين مرحلتي القراءة والكتابة للحفاظ على عمل الأكواد السابقة.
 * ملاحظة (Idempotency): الـ `generatedTxId` يجب أن يكون ID ثابتاً (deterministic)
 */
export const processSupplierTransactionInTransaction = async (
  transaction: FirestoreTransaction,
  params: SupplierTransactionParams,
  generatedTxId: string
): Promise<void> => {
  const prepared = await prepareSupplierTransactionInTransaction(transaction, params, generatedTxId);
  commitSupplierTransactionInTransaction(transaction, prepared);
};

// ==========================================
// 5. Supplier CRUD Operations
// ==========================================

export const createSupplier = async (params: CreateSupplierParams): Promise<string> => {
  const newSupplierRef = doc(collection(db, SUPPLIERS_COLLECTION));
  const now = Timestamp.now();
  
  const supplierData: Omit<Supplier, 'id'> = {
    name: params.name.trim(),
    phone: params.phone || '',
    address: params.address || '',
    balance: 0, // الرصيد الافتتاحي دائمًا 0
    isActive: params.isActive !== undefined ? params.isActive : true,
    createdBy: params.createdBy,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  await setDoc(newSupplierRef, supplierData);
  return newSupplierRef.id;
};

export const updateSupplier = async (id: string, params: UpdateSupplierParams): Promise<void> => {
  const supplierRef = doc(db, SUPPLIERS_COLLECTION, id);
  const now = Timestamp.now();
  
  const updateData: any = {
    updatedAt: now
  };
  
  if (params.name !== undefined) updateData.name = params.name.trim();
  if (params.phone !== undefined) updateData.phone = params.phone;
  if (params.address !== undefined) updateData.address = params.address;
  if (params.isActive !== undefined) updateData.isActive = params.isActive;
  
  // يمنع منعاً باتاً تحديث الرصيد (balance) من خلال هذه الدالة
  await updateDoc(supplierRef, updateData);
};

export const getSupplier = async (id: string): Promise<Supplier | null> => {
  const docRef = doc(db, SUPPLIERS_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Supplier;
};

export const getSuppliers = async (): Promise<Supplier[]> => {
  // جلب كافة الموردين لعمليات الكاش والبحث المحلي
  const q = query(collection(db, SUPPLIERS_COLLECTION), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Supplier;
  });
};

// ==========================================
// 6. Supplier Ledger (Read-Only)
// ==========================================

export const getSupplierLedger = async (supplierId: string): Promise<SupplierTransaction[]> => {
  // استدعاء سجل المورد وترتيبه تاريخياً (الأحدث أولاً من قاعدة البيانات، ليتم عكسه في الـ UI لاحقاً)
  const q = query(
    collection(db, SUPPLIER_TX_COLLECTION),
    where('supplierId', '==', supplierId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as SupplierTransaction;
  });
};
