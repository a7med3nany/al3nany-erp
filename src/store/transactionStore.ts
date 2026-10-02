import { create } from 'zustand';
import { FinancialTransaction } from '../types';
import { 
  getCashboxLedger, 
  processManualTransaction, 
  processTransfer, 
  reverseTransaction,
  ManualTransactionParams,
  TransferParams,
  ReverseTransactionParams
} from '../services/transactionService';
import { useCashboxStore } from './cashboxStore';

interface TransactionState {
  transactions: FinancialTransaction[];
  loading: boolean;
  error: string | null;
  currentCashboxId: string | null;

  // الدوال
  fetchLedger: (cashboxId: string) => Promise<void>;
  addManualTransaction: (params: ManualTransactionParams) => Promise<void>;
  addTransfer: (params: TransferParams) => Promise<void>;
  reverseTx: (params: ReverseTransactionParams) => Promise<void>;
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading: false,
  error: null,
  currentCashboxId: null,

  fetchLedger: async (cashboxId: string) => {
    const { currentCashboxId } = get();
    
    // إذا تم تغيير الخزينة، نفرغ الحركات القديمة فوراً لمنع عرض بيانات خزينة أخرى أثناء التحميل
    if (currentCashboxId !== cashboxId) {
      set({ transactions: [], currentCashboxId: cashboxId });
    }

    set({ loading: true, error: null });
    
    try {
      const data = await getCashboxLedger(cashboxId);
      set({ transactions: data, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في تحميل كشف حساب الخزينة', loading: false });
    }
  },

  addManualTransaction: async (params) => {
    set({ loading: true, error: null });
    try {
      await processManualTransaction(params);
      
      // تحديث كشف الحساب الحالي إذا كنا نعرض نفس الخزينة المتأثرة
      const { currentCashboxId } = get();
      if (currentCashboxId === params.cashboxId) {
        await get().fetchLedger(params.cashboxId);
      }
      
      // توجيه أمر لمتجر الخزائن لإعادة جلب الأرصدة المحدثة
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في تنفيذ الحركة', loading: false });
      throw err; // نعيد رمي الخطأ لتتمكن الواجهة (UI) من التقاطه وعدم إغلاق النافذة
    }
  },

  addTransfer: async (params) => {
    set({ loading: true, error: null });
    try {
      await processTransfer(params);
      
      // تحديث كشف الحساب إذا كنا نعرض الخزينة المصدر أو المستقبلة
      const { currentCashboxId } = get();
      if (currentCashboxId === params.sourceCashboxId || currentCashboxId === params.destinationCashboxId) {
        await get().fetchLedger(currentCashboxId);
      }
      
      // توجيه أمر لمتجر الخزائن لإعادة جلب الأرصدة المحدثة للخزنتين المتأثرتين
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في تنفيذ التحويل', loading: false });
      throw err;
    }
  },

  reverseTx: async (params) => {
    set({ loading: true, error: null });
    try {
      await reverseTransaction(params);
      
      // تحديث كشف الحساب الحالي
      const { currentCashboxId } = get();
      if (currentCashboxId) {
        await get().fetchLedger(currentCashboxId);
      }
      
      // توجيه أمر لمتجر الخزائن لإعادة جلب الأرصدة المحدثة
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في إلغاء الحركة', loading: false });
      throw err;
    }
  },

  clearTransactions: () => {
    set({ transactions: [], loading: false, error: null, currentCashboxId: null });
  },
}));
