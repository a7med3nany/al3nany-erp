import { create } from 'zustand';
import { Product } from '../types';
import { getProducts, createProduct, updateProduct, softDeleteProduct, ProductInput } from '../services/productService';

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  
  fetchProducts: () => Promise<void>;
  addProduct: (data: ProductInput) => Promise<void>;
  editProduct: (id: string, data: ProductInput) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getProducts();
      set({ products: data, isLoading: false });
    } catch (err: any) {
      console.error('Error fetching products:', err);
      set({ error: err.message || 'فشل في تحميل المنتجات', isLoading: false });
    }
  },

  addProduct: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const newProduct = await createProduct(data);
      set((state) => ({ 
        products: [...state.products, newProduct],
        isLoading: false 
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في إضافة المنتج', isLoading: false });
      throw err; // رمي الخطأ ليتم التقاطه في الواجهة وعرضه للمستخدم
    }
  },

  editProduct: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await updateProduct(id, data);
      set((state) => ({
        products: state.products.map(prod => 
          prod.id === id ? { ...prod, ...data, updatedAt: new Date() } : prod
        ),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في تحديث المنتج', isLoading: false });
      throw err;
    }
  },

  removeProduct: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await softDeleteProduct(id);
      set((state) => ({
        products: state.products.filter(prod => prod.id !== id),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في حذف المنتج', isLoading: false });
      throw err;
    }
  },
}));
