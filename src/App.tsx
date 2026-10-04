
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { useAuthStore } from './store/authStore';

// Layouts
import MainLayout from './layouts/MainLayout';

// Pages - Auth
import Login from './pages/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Pages - Master Data
import Products from './pages/master-data/Products';
import Warehouses from './pages/master-data/Warehouses';
import Cashboxes from './pages/master-data/Cashboxes';
import CashboxDetails from './pages/master-data/CashboxDetails';
import WarehouseDetails from './pages/master-data/WarehouseDetails';
import Categories from './pages/master-data/Categories';

// Pages - Purchases & Suppliers (Phase 3)
import Suppliers from './pages/purchases/Suppliers';
import SupplierDetails from './pages/purchases/SupplierDetails';
import SupplierPayment from './pages/purchases/SupplierPayment';
import PurchasesList from './pages/purchases/PurchasesList';
import NewPurchaseInvoice from './pages/purchases/NewPurchaseInvoice';
import PurchaseDetails from './pages/purchases/PurchaseDetails';
import PurchaseReturn from './pages/PurchaseReturn';

// Simple Dashboard Placeholder (Existing)
const Dashboard = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">لوحة القيادة</h1>
      <p className="text-gray-600">مرحباً بك في نظام العناني ERP.</p>
    </div>
  );
};

export function App() {
  const { setUser, setAuthReady, isAuthReady } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthReady(true);
    }, (error) => {
      console.error("Auth state change error:", error);
      setAuthReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, [setUser, setAuthReady]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes Wrapper */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            
            {/* Master Data Routes */}
            <Route path="/products" element={<Products />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/warehouses" element={<Warehouses />} />
            <Route path="/warehouses/:id" element={<WarehouseDetails />} />
            <Route path="/cashboxes" element={<Cashboxes />} />
            <Route path="/cashboxes/:id" element={<CashboxDetails />} />

            {/* Phase 3: Suppliers & Purchases Routes */}
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/suppliers/:id" element={<SupplierDetails />} />
            <Route path="/suppliers/:id/payment" element={<SupplierPayment />} />
            
            <Route path="/purchases" element={<PurchasesList />} />
            <Route path="/purchases/new" element={<NewPurchaseInvoice />} />
            <Route path="/purchases/return" element={<PurchaseReturn />} />
            <Route path="/purchases/:id" element={<PurchaseDetails />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
