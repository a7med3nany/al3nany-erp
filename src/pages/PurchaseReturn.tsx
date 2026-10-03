import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Search, Save, AlertCircle, 
  Receipt, CreditCard, Box, RotateCcw
} from 'lucide-react';
import { usePurchaseStore } from '../store/purchaseStore';
import { useSupplierStore } from '../store/supplierStore';
import { useProductStore } from '../store/productStore';
import { useCashboxStore } from '../store/cashboxStore';
import { auth } from '../config/firebase';

const PurchaseReturn: React.FC = () => {
  const navigate = useNavigate();

  // Stores
  const { purchaseInvoices, addPurchaseReturn, isLoading: isSaving, loadPurchaseInvoices } = usePurchaseStore();
  const { suppliers, loadSuppliers } = useSupplierStore();
  const { products, fetchProducts } = useProductStore();
  const { cashboxes, fetchCashboxes } = useCashboxStore();

  // Form State
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [refundedAmount, setRefundedAmount] = useState<number | ''>(0);
  const [cashboxId, setCashboxId] = useState<string>('');
  const [returnSessionId, setReturnSessionId] = useState<string>('');
  
  // UI State
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Initial Data Load
  useEffect(() => {
    loadPurchaseInvoices();
    loadSuppliers();
    fetchProducts();
    fetchCashboxes();
  }, [loadPurchaseInvoices, loadSuppliers, fetchProducts, fetchCashboxes]);

  // Derived Data
  const eligibleInvoices = useMemo(() => {
    return purchaseInvoices.filter(inv => 
      inv.status !== 'cancelled' && inv.status !== 'fully_returned'
    );
  }, [purchaseInvoices]);

  const searchResults = useMemo(() => {
    if (!invoiceSearch.trim()) return eligibleInvoices;
    const query = invoiceSearch.toLowerCase();
    return eligibleInvoices.filter(inv => {
      const supplier = suppliers.find(s => s.id === inv.supplierId);
      return inv.invoiceNumber.toLowerCase().includes(query) || 
             (supplier && supplier.name.toLowerCase().includes(query));
    }).slice(0, 10);
  }, [eligibleInvoices, invoiceSearch, suppliers]);

  const selectedInvoice = useMemo(() => {
    return purchaseInvoices.find(inv => inv.id === selectedInvoiceId) || null;
  }, [purchaseInvoices, selectedInvoiceId]);

  // Calculations
  const totalReturnAmount = useMemo(() => {
    if (!selectedInvoice) return 0;
    let total = 0;
    selectedInvoice.items.forEach(item => {
      const returnQty = returnItems[item.lineId] || 0;
      total += returnQty * item.netUnitCost;
    });
    return Number(total.toFixed(4));
  }, [selectedInvoice, returnItems]);

  const numRefundedAmount = Number(refundedAmount) || 0;
  const supplierCreditAmount = Number((totalReturnAmount - numRefundedAmount).toFixed(4));

  // Handlers
  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setReturnItems({});
    setRefundedAmount(0);
    setCashboxId('');
    setFormError('');
    setInvoiceSearch('');
    // توليد معرف جلسة فريد وثابت لضمان عدم تغير ID المرتجع عند إعادة المحاولة (Idempotency)
    setReturnSessionId(Date.now().toString(36)); 
  };

  const handleReturnQtyChange = (lineId: string, value: string, availableQty: number) => {
    if (value === '') {
      const newItems = { ...returnItems };
      delete newItems[lineId];
      setReturnItems(newItems);
      return;
    }

    const qty = parseFloat(value);
    if (isNaN(qty) || qty < 0) return;
    
    const safeQty = qty > availableQty ? availableQty : qty;
    
    setReturnItems(prev => ({
      ...prev,
      [lineId]: safeQty
    }));
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'منتج غير معروف';
  };

  const getSupplierName = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'مورد غير معروف';
  };

  const validateForm = (): boolean => {
    setFormError('');
    
    if (!selectedInvoice) {
      return setFormError('يجب اختيار فاتورة المشتريات الأصلية.'), false;
    }

    const hasItemsToReturn = Object.values(returnItems).some(qty => qty > 0);
    if (!hasItemsToReturn) {
      return setFormError('يجب تحديد كمية مرتجعة لصنف واحد على الأقل.'), false;
    }

    if (numRefundedAmount < 0) {
      return setFormError('المبلغ المسترد لا يمكن أن يكون سالباً.'), false;
    }

    const TOLERANCE = 0.0001;
    if (numRefundedAmount > totalReturnAmount + TOLERANCE) {
      return setFormError('المبلغ المسترد نقدًا لا يمكن أن يتجاوز إجمالي قيمة المرتجع.'), false;
    }

    if (numRefundedAmount > 0 && !cashboxId) {
      return setFormError('يجب تحديد الخزينة في حال وجود استرداد نقدي.'), false;
    }

    if (!auth.currentUser?.uid) {
      return setFormError('يجب تسجيل الدخول لإتمام العملية.'), false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !selectedInvoice) return;

    try {
      // بناء الـ ID باستخدام معرف الجلسة الثابت لضمان الـ Determinism
      const returnId = `ret_${selectedInvoice.id.slice(-6)}_${returnSessionId}`;
      const returnNumber = `PRET-${returnSessionId.toUpperCase()}`;

      const itemsToReturn = Object.entries(returnItems)
        .filter(([_, qty]) => qty > 0)
        .map(([lineId, qty]) => ({
          originalLineId: lineId,
          quantity: qty
        }));

      await addPurchaseReturn({
        returnId,
        returnNumber,
        originalInvoiceId: selectedInvoice.id,
        items: itemsToReturn,
        refundedAmount: numRefundedAmount,
        cashboxId: numRefundedAmount > 0 ? cashboxId : undefined,
        createdBy: auth.currentUser!.uid
      });

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/purchases');
      }, 2000);

    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ المرتجع.');
    }
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto p-6 dir-rtl min-h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-green-50 text-green-700 p-8 rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Save className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">تم حفظ المرتجع بنجاح</h2>
          <p>تم تسجيل المرتجع وتحديث المخزون وحساب المورد بنجاح.</p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <RotateCcw className="w-6 h-6 text-orange-600" />
              إنشاء مرتجع مشتريات
            </h1>
            <p className="text-sm text-gray-500">إرجاع بضاعة للمورد وتسوية الحسابات الخاصة بها.</p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="font-medium text-sm">{formError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Area: Invoice Selection & Items */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Invoice Selection */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Receipt className="w-5 h-5 text-blue-600" /> اختيار الفاتورة الأصلية
            </h2>
            
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ابحث برقم الفاتورة أو اسم المورد..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              
              {/* Dropdown Results */}
              {invoiceSearch && !selectedInvoice && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map(inv => (
                      <button
                        key={inv.id}
                        onClick={() => handleInvoiceSelect(inv.id)}
                        className="w-full text-right px-4 py-3 hover:bg-blue-50 flex flex-col border-b border-gray-100 last:border-0"
                      >
                        <span className="font-semibold text-gray-800">فاتورة رقم: {inv.invoiceNumber}</span>
                        <span className="text-sm text-gray-500">المورد: {getSupplierName(inv.supplierId)}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-center text-gray-500 text-sm">لا توجد فواتير قابلة للإرجاع مطابقة للبحث.</div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Invoice Details */}
            {selectedInvoice && (
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">الفاتورة المحددة</p>
                  <p className="font-bold text-gray-900 text-lg">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">المورد</p>
                  <p className="font-semibold text-gray-800">{getSupplierName(selectedInvoice.supplierId)}</p>
                </div>
                <button 
                  onClick={() => setSelectedInvoiceId('')}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
                >
                  تغيير الفاتورة
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Items for Return */}
          {selectedInvoice && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
                <Box className="w-5 h-5 text-blue-600" /> الأصناف والكميات
              </h2>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">الصنف</th>
                      <th className="px-4 py-3 font-semibold text-center">الكمية المشتراة</th>
                      <th className="px-4 py-3 font-semibold text-center text-orange-600">مرتجع سابق</th>
                      <th className="px-4 py-3 font-semibold text-center text-green-600">المتاح للإرجاع</th>
                      <th className="px-4 py-3 font-semibold text-center">صافي التكلفة/وحدة</th>
                      <th className="px-4 py-3 font-semibold text-center bg-blue-50 text-blue-800 w-32">كمية المرتجع الحالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedInvoice.items.map((rawItem) => {
                      // TypeScript-safe approach for returnedQuantity without altering the global type
                      const item = rawItem as typeof rawItem & { returnedQuantity?: number };
                      const previouslyReturned = item.returnedQuantity || 0;
                      const availableQty = item.quantity - previouslyReturned;
                      const currentReturnQty = returnItems[item.lineId] ?? '';

                      return (
                        <tr key={item.lineId} className={`transition-colors ${availableQty === 0 ? 'bg-gray-50/50 opacity-60' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {getProductName(item.productId)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 font-medium">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-center text-orange-600 font-medium">
                            {previouslyReturned}
                          </td>
                          <td className="px-4 py-3 text-center text-green-600 font-bold">
                            {availableQty}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 font-medium">
                            {item.netUnitCost.toLocaleString()} ج.م
                          </td>
                          <td className="px-4 py-3 text-center bg-blue-50/30">
                            <input
                              type="number"
                              min="0"
                              max={availableQty}
                              step="any"
                              disabled={availableQty === 0}
                              value={currentReturnQty}
                              onChange={(e) => handleReturnQtyChange(item.lineId, e.target.value, availableQty)}
                              className="w-full px-2 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-blue-800 disabled:bg-gray-100 disabled:border-gray-200"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Sidebar: Financials & Payment Settlement */}
        <div className="space-y-6">
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-3 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" /> التسوية المالية
            </h2>
            
            {!selectedInvoice ? (
              <div className="text-center py-10 text-gray-400">
                <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">الرجاء اختيار الفاتورة أولاً لعرض التسوية.</p>
              </div>
            ) : (
              <div className="space-y-4">
                
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
                  <span className="text-sm text-gray-500 block mb-1">إجمالي قيمة المرتجع</span>
                  <span className="text-2xl font-black text-gray-900">{totalReturnAmount.toLocaleString()} ج.م</span>
                  <p className="text-xs text-gray-400 mt-1">يتم التقييم باستخدام صافي التكلفة التاريخية</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="text-sm font-medium text-gray-700">المبلغ المسترد نقدًا (إن وجد)</label>
                  <input
                    type="number"
                    min="0"
                    max={totalReturnAmount}
                    step="any"
                    value={refundedAmount}
                    onChange={(e) => setRefundedAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold text-green-700"
                    placeholder="0"
                  />
                </div>

                {numRefundedAmount > 0 && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-medium text-gray-700">إيداع في الخزينة <span className="text-red-500">*</span></label>
                    <select
                      value={cashboxId}
                      onChange={(e) => setCashboxId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    >
                      <option value="">اختر الخزنة...</option>
                      {cashboxes?.filter(c => c.isActive).map(cashbox => (
                        <option key={cashbox.id} value={cashbox.id}>
                          {cashbox.name} ({cashbox.balance.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex justify-between items-center mt-4">
                  <span className="text-sm font-medium text-orange-800">تخفيض مديونية المورد (رصيد دائن):</span>
                  <span className="font-bold text-orange-700 text-lg">
                    {supplierCreditAmount.toLocaleString()} ج.م
                  </span>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="container mx-auto flex justify-end gap-4 px-4 md:px-6">
          <button
            onClick={() => navigate(-1)}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !selectedInvoice || Object.values(returnItems).every(qty => qty === 0)}
            className="px-8 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 min-w-[200px] justify-center"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <RotateCcw className="w-5 h-5" /> تأكيد المرتجع
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
};

export default PurchaseReturn;
