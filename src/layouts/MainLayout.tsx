import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, LayoutDashboard, Package, Store, Wallet, 
  Users, ShoppingCart, RotateCcw, LogOut, FolderTree, Building2 
} from 'lucide-react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  // Grouped Navigation for Premium ERP Feel
  const navGroups = [
    {
      title: 'الرئيسية',
      items: [
        { to: '/', label: 'لوحة القيادة', icon: LayoutDashboard },
      ]
    },
    {
      title: 'المخزون والمشتريات',
      items: [
        { to: '/purchases', label: 'المشتريات', icon: ShoppingCart },
        { to: '/purchases/return', label: 'مرتجع المشتريات', icon: RotateCcw },
        { to: '/products', label: 'المنتجات', icon: Package },
        { to: '/categories', label: 'التصنيفات', icon: FolderTree },
        { to: '/warehouses', label: 'المخازن', icon: Store },
      ]
    },
    {
      title: 'الموردون والخزائن',
      items: [
        { to: '/suppliers', label: 'الموردين', icon: Users },
        { to: '/cashboxes', label: 'الخزائن', icon: Wallet },
      ]
    }
  ];

  // Smart active link detection that handles nested routes correctly
  const isActiveLink = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path === '/purchases') {
      // Must match exactly /purchases or nested like /purchases/123, but NOT /purchases/return
      return location.pathname === '/purchases' || (location.pathname.startsWith('/purchases/') && !location.pathname.startsWith('/purchases/return'));
    }
    return location.pathname.startsWith(path);
  };

  // Formatted date for Header
  const currentDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans" dir="rtl">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:sticky top-0 right-0 h-screen w-72 bg-white border-l border-slate-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl lg:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Branding Area */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">العناني ERP</h1>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5 truncate uppercase tracking-widest">نظام إدارة الأعمال</p>
          </div>
          <button 
            onClick={closeSidebar} 
            className="lg:hidden text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Area */}
        <nav className="flex-1 overflow-y-auto py-6 space-y-8 scrollbar-thin">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-6 mb-3">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1 px-3">
                {group.items.map((item) => {
                  const active = isActiveLink(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={closeSidebar}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 relative overflow-hidden group ${
                        active 
                          ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50' 
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {active && (
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600 rounded-l-md" />
                      )}
                      <item.icon className={`w-5 h-5 transition-colors shrink-0 ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Actions Area */}
        <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50/50">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors group"
          >
            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-hidden">
        
        {/* Universal Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 z-30 sticky top-0 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -mr-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-slate-800 font-bold text-lg lg:hidden">العناني ERP</h2>
            <div className="hidden lg:flex items-center text-slate-500 text-sm font-medium">
              مرحباً بك، اليوم هو {currentDate}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Minimal User Avatar Placeholder */}
            <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shadow-sm">
              ع
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-screen-2xl">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
};

export default MainLayout;
