import { create } from 'zustand';
import { 
  createSupplierPayment, 
  CreateSupplierPaymentParams 
} from '../services/supplierPaymentService';

interface SupplierPaymentState {
  isLoading: boolean;
  error: string | null;
  createPayment: (params: CreateSupplierPaymentParams) => Promise<void>;
  clearError: () => void;
}

export const useSupplierPaymentStore = create<SupplierPaymentState>((set) => ({
  isLoading: false,
  error: null,

  createPayment: async (params: CreateSupplierPaymentParams) => {
    set({ isLoading: true, error: null });
    try {
      await createSupplierPayment(params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء تسجيل الدفعة.';
      set({ error: msg });
      // تمرير الخطأ في حال كانت الواجهة (UI) تحتاج لالتقاطه للتعامل معه
      throw new Error(msg);
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  }
}));

export default useSupplierPaymentStore;
