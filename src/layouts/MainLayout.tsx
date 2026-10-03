import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  Menu, X, LayoutDashboard, Package, Store, Wallet, 
  Users, ShoppingCart, RotateCcw, LogOut, FolderTree 
} from 'lucide-react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  const navItems = [
    { to: '/', label: 'لوحة القيادة', icon: LayoutDashboard },
    { to: '/purchases', label: 'المشتريات', icon: ShoppingCart },
    { to: '/purchases/return', label: 'مرتجع المشتريات', icon: RotateCcw },
    { to: '/suppliers', label: 'الموردين', icon: Users },
    { to: '/products', label: 'المنتجات', icon: Package },
    { to: '/categories', label: 'التصنيفات', icon: FolderTree },
    { to: '/warehouses', label: 'المخازن', icon: Store },
    { to: '/cashboxes', label: 'الخزائن', icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex dir-rtl" dir="rtl">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:sticky top-0 right-0 h-screen w-64 bg-white border-l border-gray-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
          <span className="text-xl font-black text-blue-700 tracking-tight">العناني ERP</span>
          <button onClick={closeSidebar} className="lg:hidden text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header (Mobile specific) */}
        <header className="lg:hidden h-16 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -mr-2 text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="mr-4 text-lg font-bold text-gray-800">العناني ERP</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

    </div>
  );
};

export default MainLayout;
