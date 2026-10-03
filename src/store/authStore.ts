import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthState {
  user: FirebaseUser | null;
  isLoading: boolean;
  isAuthReady: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setLoading: (isLoading: boolean) => void;
  setAuthReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthReady: false,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setAuthReady: (isAuthReady) => set({ isAuthReady }),
}));

export default useAuthStore;
