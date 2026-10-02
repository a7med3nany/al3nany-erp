import { create } from 'zustand';
import { 
  processManualTransaction, 
  processTransfer, 
  getCashboxLedger,
  reverseTransaction
} from '../services/transactionService';
import { CashboxTransaction, TransactionType } from '../types';

export interface ManualTransactionPayload {
  cashboxId: string;
  type: TransactionType; // 'in' | 'out' strictly
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
      set({ error: error.message, isLoading: false, transactions: [] });
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
      set({ error: error.message, isLoading: false });
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

      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("يجب إدخال مبلغ صحيح للتحويل");
      }

      await processTransfer({
        sourceCashboxId: payload.sourceCashboxId,
        destCashboxId: payload.destCashboxId,
        amount: payload.amount,
        description: payload.description || '',
        createdBy: payload.createdBy
      });

      await get().fetchLedger(payload.sourceCashboxId);
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  reverseTx: async (transactionId: string, createdBy: string) => {
    set({ isLoading: true, error: null });
    try {
      await reverseTransaction(transactionId, createdBy);
      // ملاحظة: لا نستدعي fetchLedger هنا مباشرة لأننا لا نملك cashboxId في سياق هذه الدالة، 
      // يجب على الواجهة (UI) استدعاء fetchLedger بعد نجاح الإلغاء.
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  clearTransactions: () => set({ transactions: [], error: null })
}));
