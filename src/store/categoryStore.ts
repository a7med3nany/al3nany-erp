import { create } from 'zustand';
import { Category } from '../types';
import { getCategories, createCategory, updateCategory, softDeleteCategory } from '../services/categoryService';

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  
  fetchCategories: () => Promise<void>;
  addCategory: (data: Pick<Category, 'name' | 'description' | 'isActive'>) => Promise<void>;
  editCategory: (id: string, data: Pick<Category, 'name' | 'description' | 'isActive'>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,

  fetchCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getCategories();
      set({ categories: data, isLoading: false });
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      set({ error: err.message || 'فشل في تحميل الفئات', isLoading: false });
    }
  },

  addCategory: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const newCategory = await createCategory(data);
      set((state) => ({ 
        categories: [...state.categories, newCategory],
        isLoading: false 
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في إضافة الفئة', isLoading: false });
      throw err;
    }
  },

  editCategory: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await updateCategory(id, data);
      set((state) => ({
        categories: state.categories.map(cat => 
          cat.id === id ? { ...cat, ...data, updatedAt: new Date() } : cat
        ),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في تحديث الفئة', isLoading: false });
      throw err;
    }
  },

  removeCategory: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await softDeleteCategory(id);
      set((state) => ({
        categories: state.categories.filter(cat => cat.id !== id),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'فشل في حذف الفئة', isLoading: false });
      throw err; // رمي الخطأ ليتمكن الواجهة من عرضه
    }
  },
}));
