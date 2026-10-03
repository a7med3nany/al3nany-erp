import { create } from 'zustand';
import { PurchaseInvoice } from '../types';
import { 
  getPurchaseInvoices, 
  getPurchaseInvoiceById, 
  createPurchaseInvoice, 
  CreatePurchaseInvoiceParams 
} from '../services/purchaseService';

interface PurchaseState {
  // Data
  purchaseInvoices: PurchaseInvoice[];
  currentPurchaseInvoice: PurchaseInvoice | null;
  
  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPurchaseInvoices: () => Promise<void>;
  loadPurchaseInvoice: (id: string) => Promise<void>;
  addPurchaseInvoice: (params: CreatePurchaseInvoiceParams) => Promise<void>;
  
  // Utils
  clearCurrentInvoice: () => void;
  clearError: () => void;
}

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  purchaseInvoices: [],
  currentPurchaseInvoice: null,
  isLoading: false,
  error: null,

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
      
      // إعادة تحميل قائمة الفواتير لضمان مزامنة الـ Store مع قاعدة البيانات
      await get().loadPurchaseInvoices();
      
      set({ isLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء فاتورة المشتريات.";
      set({ error: msg, isLoading: false });
      // إعادة رمي الخطأ للواجهة (UI) لتتمكن من التعامل معه (مثل إخفاء الـ Modal أو عرض Toast)
      throw new Error(msg); 
    }
  },

  clearCurrentInvoice: () => {
    set({ currentPurchaseInvoice: null });
  },

  clearError: () => {
    set({ error: null });
  }
}));
