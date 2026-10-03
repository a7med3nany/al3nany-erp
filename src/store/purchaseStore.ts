import { create } from 'zustand';
import { PurchaseInvoice, PurchaseReturn } from '../types';
import { 
  getPurchaseInvoices, 
  getPurchaseInvoiceById, 
  createPurchaseInvoice, 
  CreatePurchaseInvoiceParams,
  getPurchaseReturns,
  getPurchaseReturnById,
  createPurchaseReturn,
  CreatePurchaseReturnParams
} from '../services/purchaseService';

interface PurchaseState {
  // Data - Invoices
  purchaseInvoices: PurchaseInvoice[];
  currentPurchaseInvoice: PurchaseInvoice | null;
  
  // Data - Returns
  purchaseReturns: PurchaseReturn[];
  currentPurchaseReturn: PurchaseReturn | null;
  
  // Status
  isLoading: boolean;
  error: string | null;

  // Actions - Invoices
  loadPurchaseInvoices: () => Promise<void>;
  loadPurchaseInvoice: (id: string) => Promise<void>;
  addPurchaseInvoice: (params: CreatePurchaseInvoiceParams) => Promise<void>;
  
  // Actions - Returns
  loadPurchaseReturns: () => Promise<void>;
  loadPurchaseReturn: (id: string) => Promise<void>;
  addPurchaseReturn: (params: CreatePurchaseReturnParams) => Promise<void>;
  
  // Utils
  clearCurrentInvoice: () => void;
  clearCurrentReturn: () => void;
  clearError: () => void;
}

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  // Initial State
  purchaseInvoices: [],
  currentPurchaseInvoice: null,
  purchaseReturns: [],
  currentPurchaseReturn: null,
  isLoading: false,
  error: null,

  // ==========================================
  // Invoices Actions
  // ==========================================
  loadPurchaseInvoices: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getPurchaseInvoices();
      set({ purchaseInvoices: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ غير معروف أثناء جلب قائمة فواتير المشتريات.";
      set({ error: msg, isLoading: false });
    }
  },

  loadPurchaseInvoice: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getPurchaseInvoiceById(id);
      if (!data) {
        throw new Error("فاتورة المشتريات المطلوبة غير موجودة.");
      }
      set({ currentPurchaseInvoice: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء جلب بيانات فاتورة المشتريات.";
      set({ error: msg, isLoading: false });
    }
  },

  addPurchaseInvoice: async (params: CreatePurchaseInvoiceParams) => {
    set({ isLoading: true, error: null });
    try {
      await createPurchaseInvoice(params);
      
      // إعادة تحميل القائمة لتتزامن مع التحديثات
      await get().loadPurchaseInvoices();
      
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء فاتورة المشتريات.";
      set({ error: msg, isLoading: false });
      throw new Error(msg); 
    }
  },

  // ==========================================
  // Returns Actions
  // ==========================================
  loadPurchaseReturns: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getPurchaseReturns();
      set({ purchaseReturns: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ غير معروف أثناء جلب قائمة مرتجعات المشتريات.";
      set({ error: msg, isLoading: false });
    }
  },

  loadPurchaseReturn: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getPurchaseReturnById(id);
      if (!data) {
        throw new Error("مرتجع المشتريات المطلوب غير موجود.");
      }
      set({ currentPurchaseReturn: data, isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء جلب بيانات مرتجع المشتريات.";
      set({ error: msg, isLoading: false });
    }
  },

  addPurchaseReturn: async (params: CreatePurchaseReturnParams) => {
    set({ isLoading: true, error: null });
    try {
      await createPurchaseReturn(params);
      
      // 1. إعادة تحميل قائمة المرتجعات
      await get().loadPurchaseReturns();
      
      // 2. إعادة تحميل قائمة الفواتير (لأن حالة الفاتورة الأصلية وكمياتها المرتجعة قد تغيرت)
      await get().loadPurchaseInvoices();
      
      // 3. إذا كان المستخدم يعرض حالياً الفاتورة الأصلية التي تم الإرجاع منها، أعد تحميلها لتحديث البيانات فوراً
      const currentInvoice = get().currentPurchaseInvoice;
      if (currentInvoice && currentInvoice.id === params.originalInvoiceId) {
        await get().loadPurchaseInvoice(params.originalInvoiceId);
      }
      
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء مرتجع المشتريات.";
      set({ error: msg, isLoading: false });
      throw new Error(msg); 
    }
  },

  // ==========================================
  // Utilities
  // ==========================================
  clearCurrentInvoice: () => {
    set({ currentPurchaseInvoice: null });
  },

  clearCurrentReturn: () => {
    set({ currentPurchaseReturn: null });
  },

  clearError: () => {
    set({ error: null });
  }
}));
