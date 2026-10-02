import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, User, LayoutDashboard, Store, Wallet, Tags, Menu, X, Package } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { useAuthStore } from "../store/authStore";

export default function MainLayout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("خطأ أثناء تسجيل الخروج:", error);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? "bg-primary text-primary-foreground font-medium shadow-sm"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  const closeSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex" dir="rtl">
      {/* غطاء الشاشة للأجهزة المحمولة */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* القائمة الجانبية (Sidebar) */}
      <aside 
        className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-card border-l border-border transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        } flex flex-col`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-border">
          <h1 className="text-xl font-bold text-primary">عروج ERP</h1>
          <button 
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <NavLink to="/" onClick={closeSidebar} className={navLinkClass}>
            <LayoutDashboard className="h-5 w-5" />
            <span>لوحة التحكم</span>
          </NavLink>
          
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              البيانات الأساسية
            </p>
          </div>
          
          <NavLink to="/warehouses" onClick={closeSidebar} className={navLinkClass}>
            <Store className="h-5 w-5" />
            <span>المخازن</span>
          </NavLink>
          
          <NavLink to="/categories" onClick={closeSidebar} className={navLinkClass}>
            <Tags className="h-5 w-5" />
            <span>فئات الأصناف</span>
          </NavLink>

          <NavLink to="/products" onClick={closeSidebar} className={navLinkClass}>
            <Package className="h-5 w-5" />
            <span>المنتجات</span>
          </NavLink>

          <NavLink to="/cashboxes" onClick={closeSidebar} className={navLinkClass}>
            <Wallet className="h-5 w-5" />
            <span>الخزائن والحسابات</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-3 bg-secondary/50 rounded-lg mb-2">
            <div className="bg-primary/10 p-2 rounded-full text-primary">
              <User className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">مدير النظام</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors font-medium text-sm"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* المحتوى الرئيسي (Main Content) */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* الشريط العلوي (Header) للأجهزة المحمولة */}
        <header className="h-16 lg:hidden bg-card border-b border-border flex items-center justify-between px-4 shadow-sm z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold text-primary">عروج ERP</h1>
          </div>
        </header>

        {/* مساحة عرض الصفحات (Pages Container) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
