import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, Eye, AlertCircle, FileText, 
  Store, User, CreditCard, Clock
} from 'lucide-react';
import { usePurchaseStore } from '../../store/purchaseStore';
import { useSupplierStore } from '../../store/supplierStore';
import { useWarehouseStore } from '../../store/warehouseStore';

const PurchasesList: React.FC = () => {
  const navigate = useNavigate();

  // Stores
  const { purchaseInvoices, isLoading, error, loadPurchaseInvoices } = usePurchaseStore();
  const { suppliers, loadSuppliers } = useSupplierStore();
  const { warehouses, loadWarehouses } = useWarehouseStore();

  console.log("Diagnostic [1]: After Store Hooks Initialization", { purchaseInvoices, isLoading, suppliers, warehouses });

  // Local State for Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  // Ref for auto-scrolling to the latest invoice
  const listBottomRef = useRef<HTMLDivElement>(null);

  // Initial Load
  useEffect(() => {
    console.log("Diagnostic [2]: Inside Initial Load useEffect");
    loadPurchaseInvoices();
    loadSuppliers();
    loadWarehouses();
  }, [loadPurchaseInvoices, loadSuppliers, loadWarehouses]);
  
  console.log("Diagnostic [2b]: After Initial Load useEffect definition");

  // Scroll to bottom when invoices are loaded
  useEffect(() => {
    if (purchaseInvoices.length > 0) {
      // Small timeout to allow render completion
      setTimeout(() => {
        listBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [purchaseInvoices.length]); // Depends on the raw list length

  // Helper Functions for Data Mapping
  const getSupplierName = (id: string) => {
    const supplier = suppliers.find(s => s.id === id);
    return supplier ? supplier.name : 'غير معروف';
  };

  const getWarehouseName = (id: string) => {
    const warehouse = warehouses?.find(w => w.id === id);
    return warehouse ? warehouse.name : 'غير معروف';
  };

  // Helper Functions for UI Localization
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return { text: 'مكتملة', classes: 'bg-green-100 text-green-700 border-green-200' };
      case 'partially_returned': return { text: 'مرتجع جزئي', classes: 'bg-orange-100 text-orange-700 border-orange-200' };
      case 'fully_returned': return { text: 'مرتجع كامل', classes: 'bg-red-100 text-red-700 border-red-200' };
      case 'cancelled': return { text: 'ملغاة', classes: 'bg-gray-100 text-gray-700 border-gray-200' };
      default: return { text: status, classes: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const getPaymentMethodText = (method: string) => {
    switch (method) {
      case 'cash': return 'نقدي';
      case 'credit': return 'آجل';
      case 'partial': return 'جزئي';
      default: return method;
    }
  };

  const formatDate = (dateValue: Date | string | number | undefined | null) => {
    if (!dateValue) return '-';
    // The service returns a JS Date object via .toDate(), this handles it safely
    const date = new Date(dateValue);
    return date.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  console.log("Diagnostic [3]: Before useMemo filters calculation");

  // Filter and Sort Data (Oldest First -> Newest Last)
  const filteredAndSortedInvoices = useMemo(() => {
    console.log("Diagnostic [4a]: Inside useMemo - Before filtering", { purchaseInvoicesCount: purchaseInvoices?.length });
    
    // 1. Filter
    const filtered = purchaseInvoices.filter(inv => {
      const supplierName = getSupplierName(inv.supplierId).toLowerCase();
      const invoiceNum = inv.invoiceNumber.toLowerCase();
      const searchLower = searchQuery.toLowerCase();

      const matchesSearch = invoiceNum.includes(searchLower) || supplierName.includes(searchLower);
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || inv.paymentMethod === paymentFilter;

      return matchesSearch && matchesStatus && matchesPayment;
    });

    console.log("Diagnostic [4b]: Inside useMemo - After filtering", { filteredCount: filtered?.length });

    // 2. Sort: Since the service returns them descending (Newest first), we reverse to get Ascending (Oldest first)
    const reversed = [...filtered].reverse();
    
    console.log("Diagnostic [4c]: Inside useMemo - After reversing/sorting");
    
    return reversed;
  }, [purchaseInvoices, searchQuery, statusFilter, paymentFilter, suppliers, warehouses]);

  console.log("Diagnostic [5]: Before final return (Render started)");

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">فواتير المشتريات</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة واستعراض فواتير مشتريات البضائع من الموردين.</p>
        </div>
        <button 
          onClick={() => navigate('/purchases/new')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors w-full md:w-auto justify-center shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>فاتورة مشتريات جديدة</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="البحث برقم الفاتورة أو اسم المورد..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 lg:w-1/3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-1/2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
          >
            <option value="all">جميع الحالات</option>
            <option value="completed">مكتملة</option>
            <option value="partially_returned">مرتجع جزئي</option>
            <option value="fully_returned">مرتجع كامل</option>
            <option value="cancelled">ملغاة</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="w-full sm:w-1/2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
          >
            <option value="all">طرق الدفع</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
            <option value="partial">جزئي</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">حدث خطأ</h3>
            <p className="text-sm">{error}</p>
            <button 
              onClick={() => loadPurchaseInvoices()} 
              className="mt-2 text-sm text-red-600 underline hover:text-red-800 font-medium"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading && purchaseInvoices.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : purchaseInvoices.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">لا توجد فواتير مشتريات</h3>
          <p className="text-gray-500 mb-6">لم يتم تسجيل أي فواتير مشتريات في النظام حتى الآن.</p>
          <button 
            onClick={() => navigate('/purchases/new')}
            className="text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 px-4 py-2 rounded-lg transition-colors"
          >
            + إنشاء أول فاتورة
          </button>
        </div>
      ) : filteredAndSortedInvoices.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">لا توجد نتائج مطابقة</h3>
          <p className="text-gray-500">جرب تغيير كلمات البحث أو تعديل الفلاتر المستخدمة.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 text-sm">
                  <th className="px-6 py-4 font-semibold">رقم الفاتورة</th>
                  <th className="px-6 py-4 font-semibold">المورد والمخزن</th>
                  <th className="px-6 py-4 font-semibold">التاريخ</th>
                  <th className="px-6 py-4 font-semibold">الإجمالي</th>
                  <th className="px-6 py-4 font-semibold">التسوية (مدفوع/آجل)</th>
                  <th className="px-6 py-4 font-semibold">الحالة</th>
                  <th className="px-6 py-4 font-semibold text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedInvoices.map((invoice) => {
                  const statusBadge = getStatusBadge(invoice.status);
                  const isFullyPaid = invoice.remainingAmount === 0;

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg text-sm border border-gray-200">
                          {invoice.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 text-gray-900 font-medium">
                            <User className="w-4 h-4 text-gray-400" />
                            {getSupplierName(invoice.supplierId)}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Store className="w-3.5 h-3.5 text-gray-400" />
                            {getWarehouseName(invoice.warehouseId)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-600 text-sm flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span dir="ltr">{formatDate(invoice.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-blue-700 text-base">
                          {invoice.totalAmount.toLocaleString()} ج.م
                        </span>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> {getPaymentMethodText(invoice.paymentMethod)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded w-max">
                            مدفوع: {invoice.paidAmount.toLocaleString()}
                          </span>
                          {!isFullyPaid && (
                            <span className="text-orange-700 font-medium bg-orange-50 px-2 py-0.5 rounded w-max">
                              باقي: {invoice.remainingAmount.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.classes}`}>
                          {statusBadge.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => navigate(`/purchases/${invoice.id}`)}
                          className="p-2 text-gray-400 hover:text-blue-600 bg-white border border-gray-200 hover:border-blue-200 hover:bg-blue-50 rounded-lg transition-all"
                          title="عرض تفاصيل الفاتورة"
                        >
                          <Eye className="w-5 h-5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-4 lg:hidden p-4 bg-gray-50/30">
            {filteredAndSortedInvoices.map((invoice) => {
              const statusBadge = getStatusBadge(invoice.status);
              
              return (
                <div key={invoice.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                    <div>
                      <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded text-sm border border-gray-200">
                        {invoice.invoiceNumber}
                      </span>
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5" dir="ltr">
                         {formatDate(invoice.createdAt)} <Clock className="w-3.5 h-3.5" />
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.classes}`}>
                      {statusBadge.text}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-800 font-medium">
                      <User className="w-4 h-4 text-gray-400" />
                      {getSupplierName(invoice.supplierId)}
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Store className="w-4 h-4 text-gray-400" />
                      {getWarehouseName(invoice.warehouseId)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm border border-gray-100">
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">إجمالي الفاتورة</span>
                      <span className="font-bold text-blue-700">{invoice.totalAmount.toLocaleString()} ج.م</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">طريقة الدفع</span>
                      <span className="font-medium text-gray-800">{getPaymentMethodText(invoice.paymentMethod)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">المدفوع</span>
                      <span className="font-semibold text-green-600">{invoice.paidAmount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">المتبقي (آجل)</span>
                      <span className={`font-semibold ${invoice.remainingAmount > 0 ? 'text-orange-600' : 'text-gray-800'}`}>
                        {invoice.remainingAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => navigate(`/purchases/${invoice.id}`)}
                    className="w-full mt-2 flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    <Eye className="w-4 h-4" /> عرض تفاصيل الفاتورة
                  </button>
                </div>
              );
            })}
          </div>

          {/* Anchor for Auto-scroll */}
          <div ref={listBottomRef} />
        </div>
      )}
    </div>
  );
};

export default PurchasesList;
