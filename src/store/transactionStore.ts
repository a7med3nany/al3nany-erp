import { create } from 'zustand';
import { doc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  processManualTransaction, 
  processTransfer, 
  getCashboxLedger,
  reverseTransaction,
  reverseTransfer as reverseTransferService
} from '../services/transactionService';
import { CashboxTransaction, TransactionType } from '../types';

export interface ManualTransactionPayload {
  cashboxId: string;
  type: TransactionType;
  amount: number;
  description?: string;
  createdBy: string;
}

export interface TransferPayload {
  sourceCashboxId: string;
  destCashboxId: string;
  amount: number;
  description?: string;
  createdBy: string;
}

interface TransactionStore {
  transactions: CashboxTransaction[];
  isLoading: boolean;
  error: string | null;
  fetchLedger: (cashboxId: string) => Promise<void>;
  executeManualTransaction: (payload: ManualTransactionPayload) => Promise<void>;
  executeTransfer: (payload: TransferPayload) => Promise<void>;
  reverseTx: (transactionId: string, createdBy: string) => Promise<void>;
  reverseTransfer: (
    transferId: string, 
    sourceCashboxId: string, 
    destCashboxId: string, 
    createdBy: string
  ) => Promise<void>;
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  isLoading: false,
  error: null,
  
  fetchLedger: async (cashboxId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getCashboxLedger(cashboxId);
      set({ transactions: data, isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.message || 'حدث خطأ غير متوقع أثناء جلب سجل الخزينة', 
        isLoading: false, 
        transactions: [] 
      });
    }
  },

  executeManualTransaction: async (payload: ManualTransactionPayload) => {
    set({ isLoading: true, error: null });
    try {
      if (payload.type !== 'in' && payload.type !== 'out') {
        throw new Error("نوع العملية غير صالح. يجب أن يكون 'in' أو 'out'.");
      }
      
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("يجب إدخال مبلغ صحيح أكبر من الصفر");
      }

      await processManualTransaction({
        cashboxId: payload.cashboxId,
        type: payload.type,
        amount: payload.amount,
        description: payload.description || '',
        createdBy: payload.createdBy,
        referenceType: 'manual'
      });

      await get().fetchLedger(payload.cashboxId);
    } catch (error: any) {
      set({ 
        error: error.message || 'حدث خطأ غير متوقع', 
        isLoading: false 
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  executeTransfer: async (payload: TransferPayload) => {
    set({ isLoading: true, error: null });
    try {
      if (!payload.sourceCashboxId || !payload.destCashboxId) {
        throw new Error("بيانات الخزينة المصدر أو المستقبل مفقودة");
      }

      if (payload.sourceCashboxId === payload.destCashboxId) {
        throw new Error("لا يمكن التحويل لنفس الخزينة");
      }

      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("يجب إدخال مبلغ صحيح للتحويل");
      }

      // إنشاء معرّف ثابت مرة واحدة للعملية لتفعيل حماية Idempotency في الـ Service
      const transferId = doc(collection(db, 'cashbox_transactions')).id;

      await processTransfer({
        sourceCashboxId: payload.sourceCashboxId,
        destCashboxId: payload.destCashboxId,
        amount: payload.amount,
        description: payload.description || '',
        createdBy: payload.createdBy,
        transferId
      });

      // إعادة تحميل سجل الخزينة المصدر فقط لتحديث الواجهة
      await get().fetchLedger(payload.sourceCashboxId);
    } catch (error: any) {
      set({ 
        error: error.message || 'حدث خطأ غير متوقع', 
        isLoading: false 
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  reverseTx: async (transactionId: string, createdBy: string) => {
    set({ isLoading: true, error: null });
    try {
      await reverseTransaction(transactionId, createdBy);
      // ملاحظة: لا نستدعي fetchLedger هنا لأننا لا نخمن الـ cashboxId
      // يتم الاعتماد على الواجهة لإعادة تحميل البيانات إذا لزم الأمر
    } catch (error: any) {
      set({ 
        error: error.message || 'حدث خطأ غير متوقع أثناء إلغاء المعاملة', 
        isLoading: false 
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  reverseTransfer: async (
    transferId: string, 
    sourceCashboxId: string, 
    destCashboxId: string, 
    createdBy: string
  ) => {
    set({ isLoading: true, error: null });
    try {
      await reverseTransferService(
        transferId,
        sourceCashboxId,
        destCashboxId,
        createdBy
      );

      // إعادة تحميل سجل الخزينة المصدر لتحديث الواجهة
      await get().fetchLedger(sourceCashboxId);
    } catch (error: any) {
      set({ 
        error: error.message || 'فشل في عكس التحويل', 
        isLoading: false 
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  clearTransactions: () => set({ 
    transactions: [], 
    error: null,
    isLoading: false
  })
}));
