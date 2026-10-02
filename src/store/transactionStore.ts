import { create } from 'zustand';
import { FinancialTransaction } from '../types';
import { 
  getCashboxLedger, 
  processManualTransaction, 
  processTransfer, 
  reverseTransaction,
  reverseTransfer,
  ManualTransactionParams,
  TransferParams,
  ReverseTransactionParams,
  ReverseTransferParams
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
  reverseTransferTx: (params: ReverseTransferParams) => Promise<void>;
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading: false,
  error: null,
  currentCashboxId: null,

  fetchLedger: async (cashboxId: string) => {
    const { currentCashboxId } = get();
    
    // إذا تم تغيير الخزينة، نفرغ الحركات القديمة فوراً لمنع التداخل البصري
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
      
      const { currentCashboxId } = get();
      if (currentCashboxId === params.cashboxId) {
        await get().fetchLedger(params.cashboxId);
      }
      
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في تنفيذ الحركة', loading: false });
      throw err; 
    }
  },

  addTransfer: async (params) => {
    set({ loading: true, error: null });
    try {
      await processTransfer(params);
      
      const { currentCashboxId } = get();
      if (currentCashboxId === params.sourceCashboxId || currentCashboxId === params.destinationCashboxId) {
        await get().fetchLedger(currentCashboxId);
      }
      
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
      
      const { currentCashboxId } = get();
      if (currentCashboxId) {
        await get().fetchLedger(currentCashboxId);
      }
      
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في إلغاء الحركة', loading: false });
      throw err;
    }
  },

  // الدالة الجديدة للتحويل العكسي
  reverseTransferTx: async (params) => {
    set({ loading: true, error: null });
    try {
      await reverseTransfer(params);
      
      const { currentCashboxId } = get();
      if (currentCashboxId) {
        await get().fetchLedger(currentCashboxId);
      }
      
      await useCashboxStore.getState().fetchCashboxes();
      
      set({ loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'فشل في إلغاء التحويل', loading: false });
      throw err;
    }
  },

  clearTransactions: () => {
    set({ transactions: [], loading: false, error: null, currentCashboxId: null });
  },
}));
