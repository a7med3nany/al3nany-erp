import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuthStore();

  // 1. حالة التحقق (عندما يتصل النظام بـ Firebase لمعرفة حالة المستخدم)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="font-medium animate-pulse">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  // 2. حالة الرفض (المستخدم غير مسجل الدخول) -> توجيه لصفحة تسجيل الدخول
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. حالة القبول (المستخدم مسجل الدخول) -> السماح بالمرور للمكون المطلوب
  return <Outlet />;
}
