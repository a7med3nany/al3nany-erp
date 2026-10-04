import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  Save,
  AlertCircle,
  User,
  CreditCard,
  Wallet,
  FileText,
  X,
  Banknote
} from 'lucide-react';

import { useSupplierStore } from '../../store/supplierStore';
import { useCashboxStore } from '../../store/cashboxStore';
import { useSupplierPaymentStore } from '../../store/supplierPaymentStore';
import { auth } from '../../config/firebase';

const SupplierPayment: React.FC = () => {
  const navigate = useNavigate();

  // ==========================================
  // Stores
  // ==========================================
  const { suppliers, loadSuppliers, isLoading: isSupplierLoading } = useSupplierStore();
  const { cashboxes, fetchCashboxes } = useCashboxStore();
  const { createPayment, isLoading: isSaving, error: storeError, clearError } = useSupplierPaymentStore();

  // ==========================================
  // Form State
  // ==========================================
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'other'>('cash');
  const [cashboxId, setCashboxId] = useState('');
  const [description, setDescription] = useState('');

  // ==========================================
  // UI State
  // ==========================================
  const [supplierSearch, setSupplierSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // ==========================================
  // Initial Load & Cleanup
  // ==========================================
  useEffect(() => {
    loadSuppliers();
    fetchCashboxes();

    return () => {
      clearError();
    };
  }, [loadSuppliers, fetchCashboxes, clearError]);

  // ==========================================
  // Derived Data
  // ==========================================
  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === supplierId) || null;
  }, [suppliers, supplierId]);

  const supplierResults = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) {
      return suppliers.filter(supplier => supplier.isActive).slice(0, 8);
    }
    return suppliers
      .filter(supplier => supplier.isActive && (supplier.name.toLowerCase().includes(query) || supplier.phone?.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [suppliers, supplierSearch]);

  // ==========================================
  // Handlers
  // ==========================================
  const handleSelectSupplier = (id: string, name: string) => {
    setSupplierId(id);
    setSupplierSearch(name);
    setFormError('');
  };

  const formatBalance = (balance: number) => {
    if (balance > 0) return { text: `مستحق للمورد: ${balance.toLocaleString()} ج.م`, color: 'text-orange-600 bg-orange-50 border-orange-200' };
    if (balance < 0) return { text: `رصيد لنا لدى المورد: ${Math.abs(balance).toLocaleString()} ج.م`, color: 'text-green-600 bg-green-50 border-green-200' };
    return { text: 'الرصيد متزن: 0 ج.م', color: 'text-gray-600 bg-gray-50 border-gray-200' };
  };

  const validateForm = (): boolean => {
    setFormError('');
    clearError();

    if (!supplierId) {
      setFormError('يجب اختيار المورد.');
      return false;
    }

    if (amount === '' || Number(amount) <= 0) {
      setFormError('مبلغ الدفعة يجب أن يكون رقماً أكبر من الصفر.');
      return false;
    }

    if (paymentMethod === 'cash' && !cashboxId) {
      setFormError('يجب اختيار الخزينة عند تحديد الدفع النقدي.');
      return false;
    }

    if (!description.trim()) {
      setFormError('يجب إدخال وصف للعملية.');
      return false;
    }

    const userUid = auth.currentUser?.uid;
    if (!userUid) {
      setFormError('يجب تسجيل الدخول لإتمام العملية.');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await createPayment({
        supplierId,
        amount: Number(amount),
        paymentMethod,
        cashboxId: paymentMethod === 'cash' ? cashboxId : undefined,
        description: description.trim(),
        createdBy: auth.currentUser!.uid
      });

      setIsSuccess(true);

      // Optional: Refresh suppliers to update balance locally
      loadSuppliers();

      setTimeout(() => {
        navigate(-1);
      }, 2000);
    } catch (err) {
      // Error is caught and set in the store, we can also set it locally if needed
      // storeError will be displayed via the UI
    }
  };

  // ==========================================
  // Render: Success State
  // ==========================================
  if (isSuccess) {
    return (
      <div className="container mx-auto p-6 dir-rtl min-h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-green-50 text-green-700 p-8 rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full border border-green-100 shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Save className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">تم تسجيل الدفعة بنجاح</h2>
          <p className="text-sm opacity-90">
            تم تسجيل الدفعة وتحديث رصيد المورد بنجاح.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Render: Main Form
  // ==========================================
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">تسجيل دفعة مورد</h1>
            <p className="text-sm text-gray-500 mt-1">
              تسديد المستحقات المالية للموردين وتحديث الأرصدة.
            </p>
          </div>
        </div>
      </div>

      {/* Errors */}
      {(formError || storeError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="font-medium text-sm">{formError || storeError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Supplier Selection Card */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <User className="w-5 h-5 text-blue-600" /> اختيار المورد
            </h2>

            <div className="space-y-4">
              {selectedSupplier ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">المورد المحدد</p>
                    <p className="font-bold text-gray-900 text-lg">{selectedSupplier.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierId('');
                      setSupplierSearch('');
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
                  >
                    تغيير المورد
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value);
                      setSupplierId('');
                    }}
                    placeholder="ابحث باسم المورد أو رقم الهاتف..."
                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                  {supplierSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierSearch('');
                        setSupplierId('');
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}

                  {(supplierSearch.trim() || suppliers.length > 0) && !isSupplierLoading && (
                    <div className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                      {supplierResults.length > 0 ? (
                        supplierResults.map(supplier => (
                          <button
                            key={supplier.id}
                            type="button"
                            onClick={() => handleSelectSupplier(supplier.id, supplier.name)}
                            className="w-full text-right px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                          >
                            <div className="font-semibold text-gray-800">{supplier.name}</div>
                            {supplier.phone && (
                              <div className="text-xs text-gray-500 mt-0.5">{supplier.phone}</div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500">
                          لا يوجد مورد نشط مطابق للبحث.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Current Balance Display */}
              {selectedSupplier && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${formatBalance(selectedSupplier.balance).color}`}>
                  <FileText className="w-5 h-5 opacity-80" />
                  <div>
                    <p className="text-xs font-semibold opacity-80 uppercase tracking-wider mb-0.5">الرصيد المالي الحالي</p>
                    <p className="font-bold text-lg">{formatBalance(selectedSupplier.balance).text}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Details Card */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Banknote className="w-5 h-5 text-blue-600" /> بيانات الدفعة
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  مبلغ الدفعة <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-lg font-bold text-gray-900 transition-all"
                    placeholder="0.00"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">ج.م</span>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  وصف العملية <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  placeholder="مثال: دفعة تحت الحساب لشهر أكتوبر..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <CreditCard className="w-5 h-5 text-blue-600" /> طريقة الدفع
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all flex flex-col items-center gap-2 ${
                    paymentMethod === 'cash'
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                  نقدي (خزينة)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('other')}
                  className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all flex flex-col items-center gap-2 ${
                    paymentMethod === 'other'
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  طريقة أخرى
                </button>
              </div>

              {paymentMethod === 'cash' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 pt-2">
                  <label className="text-sm font-medium text-gray-700">
                    خزينة السداد <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cashboxId}
                    onChange={(e) => setCashboxId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                  >
                    <option value="">اختر الخزينة...</option>
                    {cashboxes?.filter(c => c.isActive).map(cashbox => (
                      <option key={cashbox.id} value={cashbox.id}>
                        {cashbox.name} ({cashbox.balance.toLocaleString()} ج.م)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    سيتم التحقق من توفر الرصيد الكافي بالخزينة.
                  </p>
                </div>
              )}

              {paymentMethod === 'other' && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl animate-in fade-in">
                  <p className="text-sm text-gray-600 text-center">
                    لن يتم تسجيل حركة سحب من أي خزينة في النظام. سيتم تخفيض رصيد المورد فقط.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="container mx-auto flex justify-end gap-4 px-4 md:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !supplierId || !amount || (paymentMethod === 'cash' && !cashboxId) || !description.trim()}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 min-w-[200px] justify-center shadow-sm"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" /> تسجيل الدفعة
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierPayment;
