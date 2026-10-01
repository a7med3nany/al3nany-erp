import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

// تعريف هيكل البيانات الخاص بحالة المصادقة
interface AuthState {
  user: FirebaseUser | null;
  isLoading: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setLoading: (isLoading: boolean) => void;
}

// إنشاء متجر الحالة العالمي
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // نبدأ حالة التحميل بـ true حتى نتأكد من حالة المستخدم من سيرفرات Firebase عند فتح النظام
  isLoading: true, 
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));
