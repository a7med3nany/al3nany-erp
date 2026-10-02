import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { useAuthStore } from "./store/authStore";

import MainLayout from "./layouts/MainLayout";
import Login from "./pages/auth/Login";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Warehouses from "./pages/master-data/Warehouses";
import Cashboxes from "./pages/master-data/Cashboxes";
import CashboxDetails from "./pages/master-data/CashboxDetails";
import Categories from "./pages/master-data/Categories";
import Products from "./pages/master-data/Products";

// تهيئة عميل React Query لإدارة استدعاءات البيانات
const queryClient = new QueryClient();

// مكون مؤقت للصفحة الرئيسية
const DashboardPlaceholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-2 text-foreground font-mono tracking-wider">مرحباً بك في نظام EL3NANY ERP</h2>
    <p>لقد قمت بتسجيل الدخول بنجاح وأنت الآن داخل المنطقة المحمية.</p>
  </div>
);

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // التنصت على حالة تسجيل الدخول من فايربيز بمجرد تشغيل التطبيق
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // إيقاف شاشة التحميل بمجرد معرفة الحالة (سواء مسجل أو غير مسجل)
    });

    // تنظيف التنصت عند إغلاق المكون لتجنب تسريب الذاكرة
    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          {/* مسار عام: شاشة تسجيل الدخول */}
          <Route path="/login" element={<Login />} />

          {/* مسارات محمية: لا يمكن الدخول لها إلا بتسجيل الدخول */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<DashboardPlaceholder />} />
              
              {/* شاشات البيانات الأساسية (Master Data) */}
              <Route path="warehouses" element={<Warehouses />} />
              <Route path="categories" element={<Categories />} />
              <Route path="products" element={<Products />} />
              <Route path="cashboxes" element={<Cashboxes />} />
              <Route path="cashboxes/:id" element={<CashboxDetails />} />
              
              {/* سيتم إضافة شاشات (الفواتير) هنا تباعاً */}
            </Route>
          </Route>

          {/* في حال كتابة مسار غير موجود، يتم إرجاع المستخدم للرئيسية */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
