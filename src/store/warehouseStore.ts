import { create } from 'zustand';
import { Warehouse } from '../types';
import { getWarehouses, initializeMainWarehouse, addWarehouse, updateWarehouse } from '../services/warehouseService';

interface WarehouseState {
  warehouses: Warehouse[];
  isLoading: boolean;
  error: string | null;
  // الدوال
  fetchWarehouses: () => Promise<void>;
  createWarehouse: (data: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt' | 'isMain'>) => Promise<void>;
  editWarehouse: (id: string, data: Partial<Omit<Warehouse, 'id' | 'createdAt' | 'isMain'>>) => Promise<void>;
}

export const useWarehouseStore = create<WarehouseState>((set, get) => ({
  warehouses: [],
  isLoading: false,
  error: null,

  fetchWarehouses: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. التأكد من وجود المخزن الرئيسي أولاً قبل الجلب
      await initializeMainWarehouse();
      
      // 2. جلب كافة المخازن
      const data = await getWarehouses();
      set({ warehouses: data, isLoading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في تحميل المخازن', isLoading: false });
    }
  },

  createWarehouse: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await addWarehouse(data);
      // إعادة جلب القائمة لتحديث الحالة فوراً
      await get().fetchWarehouses();
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في إضافة المخزن الجديد', isLoading: false });
    }
  },

  editWarehouse: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await updateWarehouse(id, data);
      // إعادة جلب القائمة لتحديث الحالة فوراً
      await get().fetchWarehouses();
    } catch (err: any) {
      console.error(err);
      set({ error: 'فشل في تحديث بيانات المخزن', isLoading: false });
    }
  },
}));
