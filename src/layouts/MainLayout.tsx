import { Outlet, NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { useAuthStore } from "../store/authStore";
import { LogOut, User, LayoutDashboard, Store, Wallet, ShoppingCart, Settings } from "lucide-react";

export default function MainLayout() {
  const { user } = useAuthStore();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // دالة مساعدة لتحديد تنسيق الرابط بناءً على حالته (نشط أم لا)
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors font-medium ${
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* القائمة الجانبية (Sidebar) */}
      <aside className="w-64 bg-card border-l border-border hidden md:flex flex-col z-20 shadow-sm">
        <div className="h-16 flex items-center justify-center border-b border-border">
          <h1 className="text-xl font-bold text-primary tracking-tight">Al-3nany ERP</h1>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-1">
          <NavLink to="/" end className={navLinkClass}>
            <LayoutDashboard className="h-5 w-5" />
            <span>لوحة التحكم</span>
          </NavLink>
          
          <NavLink to="/warehouses" className={navLinkClass}>
            <Store className="h-5 w-5" />
            <span>المخازن</span>
          </NavLink>

          <NavLink to="/cashboxes" className={navLinkClass}>
            <Wallet className="h-5 w-5" />
            <span>الخزائن والحسابات</span>
          </NavLink>
          
          <NavLink to="/sales" className={navLinkClass}>
            <ShoppingCart className="h-5 w-5" />
            <span>المبيعات</span>
          </NavLink>
          
          <div className="mt-auto">
            <NavLink to="/settings" className={navLinkClass}>
              <Settings className="h-5 w-5" />
              <span>الإعدادات</span>
            </NavLink>
          </div>
        </nav>
      </aside>

      {/* المحتوى الرئيسي */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* الشريط العلوي (Topbar) */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 z-10 shadow-sm">
          <div className="md:hidden font-bold text-primary text-lg">
            Al-3nany ERP
          </div>
          
          {/* قسم المستخدم وزر الخروج متموضع في اليسار */}
          <div className="flex items-center gap-4 mr-auto">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-md border border-border">
              <User className="h-4 w-4" />
              <span className="truncate max-w-[180px] font-medium">{user?.email || 'مستخدم النظام'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 px-4 py-1.5 rounded-md transition-colors font-semibold"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        {/* منطقة عرض الصفحات (Outlet) */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-background/90">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
