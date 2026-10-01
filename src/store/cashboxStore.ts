import { create } from 'zustand';
import { Cashbox } from '../types';
import { getCashboxes, initializeDefaultCashboxes, addCashbox, updateCashbox } from '../services/cashboxService';

interface CashboxState {
  cashboxes: Cashbox[];
  isLoading: boolean;
  error: string | null;
  // الدوال
  fetchCashboxes: () => Promise<void>;
  createCashbox: (data: Omit<Cashbox, 'id' | 'createdAt' | 'updatedAt' | 'isMain' | 'isDaily' | 'balance'>) => Promise<void>;
  editCashbox: (id: string, data: Partial<Omit<Cashbox, 'id' | 'createdAt' | 'isMain' | 'isDaily' | 'balance'>>) => Promise<void>;
}

export const useCashboxStore = create<CashboxState>((set, get) => ({
  cashboxes: [],
  isLoading: false,
  error: null,

  fetchCashboxes: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. التأكد من وجود الخزنة الرئيسية وخزنة اليوم أولاً
      await initializeDefaultCashboxes();
      
      // 2. جلب كافة الخزائن
      const data = await getCashboxes();
      set({ cashboxes: data, isLoading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في تحميل بيانات الخزائن', isLoading: false });
    }
  },

  createCashbox: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await addCashbox(data);
      // إعادة جلب القائمة لتحديث الحالة فوراً في الذاكرة
      await get().fetchCashboxes();
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في إضافة الخزينة الجديدة', isLoading: false });
    }
  },

  editCashbox: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await updateCashbox(id, data);
      // إعادة جلب القائمة لتحديث الحالة
      await get().fetchCashboxes();
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في تحديث بيانات الخزينة', isLoading: false });
    }
  },
}));
