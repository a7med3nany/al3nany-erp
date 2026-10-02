import { create } from 'zustand';
import { InventoryItem } from '../types';
import { getWarehouseStock } from '../services/inventoryService';

interface InventoryStore {
  items: InventoryItem[];
  isLoading: boolean;
  error: string | null;
  
  loadWarehouseStock: (warehouseId: string) => Promise<void>;
  clear: () => void;
}

export const useInventoryStore = create<InventoryStore>((set) => ({
  items: [],
  isLoading: false,
  error: null,

  loadWarehouseStock: async (warehouseId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getWarehouseStock(warehouseId);
      set({ items: data, isLoading: false });
    } catch (err: any) {
      // تم استخدام any هنا لالتقاط الخطأ القادم من Promise/Firestore واستخراج الرسالة النصية منه
      console.error('Error loading warehouse stock:', err);
      set({ error: err.message || 'فشل في تحميل أرصدة المخزن', isLoading: false });
    }
  },

  clear: () => {
    set({ items: [], isLoading: false, error: null });
  }
}));
