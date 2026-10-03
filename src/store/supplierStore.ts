import { create } from 'zustand';
import { Supplier, SupplierTransaction } from '../types';
import { 
  getSuppliers, 
  getSupplier, 
  createSupplier, 
  updateSupplier, 
  getSupplierLedger,
  CreateSupplierParams,
  UpdateSupplierParams
} from '../services/supplierService';

interface SupplierState {
  // Data
  suppliers: Supplier[];
  currentSupplier: Supplier | null;
  supplierLedger: SupplierTransaction[];
  
  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSuppliers: () => Promise<void>;
  loadSupplier: (id: string) => Promise<void>;
  addSupplier: (params: CreateSupplierParams) => Promise<void>;
  editSupplier: (id: string, params: UpdateSupplierParams) => Promise<void>;
  toggleSupplierActive: (id: string, currentStatus: boolean) => Promise<void>;
  loadSupplierLedger: (supplierId: string) => Promise<void>;
  
  // Utils
  clearCurrentData: () => void;
  clearError: () => void;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  currentSupplier: null,
  supplierLedger: [],
  isLoading: false,
  error: null,

  loadSuppliers: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getSuppliers();
      set({ suppliers: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ غير معروف أثناء جلب قائمة الموردين.";
      set({ error: msg, isLoading: false });
    }
  },

  loadSupplier: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getSupplier(id);
      if (!data) {
        throw new Error("المورد المطلوب غير موجود.");
      }
      set({ currentSupplier: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء جلب بيانات المورد.";
      set({ error: msg, isLoading: false });
    }
  },

  addSupplier: async (params: CreateSupplierParams) => {
    set({ isLoading: true, error: null });
    try {
      await createSupplier(params);
      // إعادة جلب الموردين لتحديث القائمة بالبيانات الجديدة
      await get().loadSuppliers();
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إضافة المورد الجديد.";
      set({ error: msg, isLoading: false });
      throw new Error(msg); // لإتاحة التعامل مع الخطأ من الـ UI إذا لزم الأمر
    }
  },

  editSupplier: async (id: string, params: UpdateSupplierParams) => {
    set({ isLoading: true, error: null });
    try {
      await updateSupplier(id, params);
      
      // تحديث قائمة الموردين
      await get().loadSuppliers();
      
      // تحديث المورد الحالي إذا كان هو المفتوح حالياً لضمان دقة العرض
      if (get().currentSupplier?.id === id) {
        await get().loadSupplier(id);
      }
      
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تعديل بيانات المورد.";
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  toggleSupplierActive: async (id: string, currentStatus: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await updateSupplier(id, { isActive: !currentStatus });
      
      await get().loadSuppliers();
      if (get().currentSupplier?.id === id) {
        await get().loadSupplier(id);
      }
      
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تغيير حالة المورد.";
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  loadSupplierLedger: async (supplierId: string) => {
    set({ isLoading: true, error: null });
    try {
      const ledger = await getSupplierLedger(supplierId);
      set({ supplierLedger: ledger, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء جلب كشف حساب المورد.";
      set({ error: msg, isLoading: false });
    }
  },

  clearCurrentData: () => {
    set({ currentSupplier: null, supplierLedger: [] });
  },

  clearError: () => {
    set({ error: null });
  }
}));
