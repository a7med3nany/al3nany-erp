import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MainLayout from "./layouts/MainLayout";

// تهيئة عميل React Query لإدارة استدعاءات البيانات والتخزين المؤقت (Caching)
const queryClient = new QueryClient();

// مكون مؤقت للصفحة الرئيسية حتى يتم برمجة لوحة التحكم (Dashboard)
const DashboardPlaceholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-2 text-foreground">مرحباً بك في نظام العناني ERP</h2>
    <p>تم الانتهاء من بناء الهيكل الأساسي (Foundation) بنجاح.</p>
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* تم استخدام HashRouter ليعمل التطبيق كملف Zip على أي استضافة دون مشاكل */}
      <HashRouter>
        <Routes>
          {/* الهيكل الأساسي يغلف جميع الصفحات الداخلية */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<DashboardPlaceholder />} />
            {/* سيتم إضافة مسارات المبيعات، المخازن، وغيرها هنا لاحقاً */}
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
