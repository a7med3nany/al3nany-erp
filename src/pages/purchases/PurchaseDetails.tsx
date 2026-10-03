import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, AlertCircle, Receipt, User, Store, 
  CreditCard, Clock, Box, FileText 
} from 'lucide-react';
import { usePurchaseStore } from '../../store/purchaseStore';
import { useSupplierStore } from '../../store/supplierStore';
import { useWarehouseStore } from '../../store/warehouseStore';
import { useProductStore } from '../../store/productStore';

const PurchaseDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Stores
  const { 
    currentPurchaseInvoice, 
    isLoading: isInvoiceLoading, 
    error, 
    loadPurchaseInvoice, 
    clearCurrentInvoice 
  } = usePurchaseStore();
  
  const { 
    suppliers, 
    isLoading: isSuppliersLoading, 
    loadSuppliers 
  } = useSupplierStore();
  
  const { 
    warehouses, 
    isLoading: isWarehousesLoading, 
    loadWarehouses 
  } = useWarehouseStore();
  
  const { 
    products, 
    isLoading: isProductsLoading, 
    loadProducts 
  } = useProductStore();

  // Initial Data Load & Cleanup
  useEffect(() => {
    if (id) {
      clearCurrentInvoice(); // لمنع ظهور بيانات فاتورة سابقة أثناء التحميل
      loadPurchaseInvoice(id);
      loadSuppliers();
      loadWarehouses();
      loadProducts();
    }
    
    // Cleanup on unmount
    return () => {
      clearCurrentInvoice();
    };
  }, [id, loadPurchaseInvoice, loadSuppliers, loadWarehouses, loadProducts, clearCurrentInvoice]);

  // Helper Functions for Data Mapping
  const getSupplierName = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'مورد غير معروف';
  };

  const getWarehouseName = (warehouseId: string) => {
    const warehouse = warehouses?.find(w => w.id === warehouseId);
    return warehouse ? warehouse.name : 'مخزن غير معروف';
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'منتج غير معروف';
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
    const date = new Date(dateValue);
    return date.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 1. Render Missing ID State (Early Return)
  if (!id) {
    return (
      <div className="container mx-auto p-6 text-center py-20 dir-rtl">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">معرّف الفاتورة غير صالح</h2>
        <p className="text-gray-500 mb-6">الرابط المطلوب لا يحتوي على معرّف فاتورة صحيح.</p>
        <button 
          onClick={() => navigate('/purchases')}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
        >
          <ArrowRight className="w-5 h-5" /> العودة لقائمة المشتريات
        </button>
      </div>
    );
  }

  // Combined Loading State (Master Data + Invoice Data)
  const isDataLoading = isInvoiceLoading || isSuppliersLoading || isWarehousesLoading || isProductsLoading;
  
  // Check if we are still looking at an old invoice while the new one fetches
  const isStaleData = currentPurchaseInvoice && currentPurchaseInvoice.id !== id;

  // 2. Render Loading State
  if (isDataLoading || isStaleData) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 3. Render Error State
  if (error && !currentPurchaseInvoice) {
    return (
      <div className="container mx-auto p-6 dir-rtl">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex flex-col items-center text-center gap-3 max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h2 className="text-lg font-bold">عذراً، حدث خطأ</h2>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => id && loadPurchaseInvoice(id)} 
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
          >
            إعادة المحاولة
          </button>
          <button 
            onClick={() => navigate('/purchases')} 
            className="mt-2 text-red-600 hover:underline text-sm"
          >
            العودة لقائمة المشتريات
          </button>
        </div>
      </div>
    );
  }

  // 4. Render Not Found State
  if (!currentPurchaseInvoice) {
    return (
      <div className="container mx-auto p-6 text-center py-20 dir-rtl">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Receipt className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">الفاتورة غير موجودة</h2>
        <p className="text-gray-500 mb-6">فاتورة المشتريات المطلوبة غير مسجلة في النظام.</p>
        <button 
          onClick={() => navigate('/purchases')}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
        >
          <ArrowRight className="w-5 h-5" /> العودة لقائمة المشتريات
        </button>
      </div>
    );
  }

  const invoice = currentPurchaseInvoice;
  const statusBadge = getStatusBadge(invoice.status);

  // 5. Render Main Content
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/purchases')}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="رجوع"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              فاتورة مشتريات
              <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg text-lg border border-blue-100">
                #{invoice.invoiceNumber}
              </span>
            </h1>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1" dir="ltr">
              {formatDate(invoice.createdAt)} <Clock className="w-4 h-4" />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold border ${statusBadge.classes}`}>
            الحالة: {statusBadge.text}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content Area (Details & Items) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="bg-blue-50 p-3 rounded-full text-blue-600 shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">المورد</p>
                <p className="font-bold text-gray-900 text-lg">{getSupplierName(invoice.supplierId)}</p>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="bg-purple-50 p-3 rounded-full text-purple-600 shrink-0">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">مخزن الاستلام</p>
                <p className="font-bold text-gray-900 text-lg">{getWarehouseName(invoice.warehouseId)}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
              <Box className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-800">الأصناف والتكاليف التفصيلية</h2>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                    <th className="px-4 py-3 font-semibold">الصنف</th>
                    <th className="px-4 py-3 font-semibold text-center">الكمية</th>
                    <th className="px-4 py-3 font-semibold text-center">سعر الشراء</th>
                    <th className="px-4 py-3 font-semibold text-center">إجمالي السطر</th>
                    <th className="px-4 py-3 font-semibold text-center text-red-600 bg-red-50/30">خصم موزع</th>
                    <th className="px-4 py-3 font-semibold text-center text-orange-600 bg-orange-50/30">مصاريف موزعة</th>
                    <th className="px-4 py-3 font-bold text-blue-700 bg-blue-50/30 text-center">صافي التكلفة/وحدة</th>
                    <th className="px-4 py-3 font-bold text-gray-900 bg-gray-100/50 text-center">التكلفة النهائية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.items.map((item, index) => (
                    <tr key={item.lineId} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {index + 1}. {getProductName(item.productId)}
                      </td>
                      <td className="px-4 py-4 text-center font-medium">
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center text-gray-600">
                        {item.purchasePrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-gray-700">
                        {item.grossLineTotal.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center text-red-600 bg-red-50/10">
                        {item.allocatedDiscount > 0 ? `-${item.allocatedDiscount.toLocaleString()}` : '0'}
                      </td>
                      <td className="px-4 py-4 text-center text-orange-600 bg-orange-50/10">
                        {item.allocatedAcquisitionCharges > 0 ? `+${item.allocatedAcquisitionCharges.toLocaleString()}` : '0'}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-blue-700 bg-blue-50/10">
                        {item.netUnitCost.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-gray-900 bg-gray-50/50">
                        {item.totalCost.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-gray-100">
              {invoice.items.map((item, index) => (
                <div key={item.lineId} className="p-4 space-y-4">
                  <h3 className="font-bold text-gray-900">{index + 1}. {getProductName(item.productId)}</h3>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 p-2 rounded-lg text-center">
                      <span className="block text-gray-500 text-xs mb-1">الكمية</span>
                      <span className="font-semibold">{item.quantity.toLocaleString()}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg text-center">
                      <span className="block text-gray-500 text-xs mb-1">سعر الشراء</span>
                      <span className="font-semibold">{item.purchasePrice.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm border border-gray-100 rounded-xl p-3">
                    <div className="flex justify-between text-gray-600">
                      <span>إجمالي السطر:</span>
                      <span className="font-semibold">{item.grossLineTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>خصم موزع (-):</span>
                      <span>{item.allocatedDiscount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-orange-600">
                      <span>مصاريف موزعة (+):</span>
                      <span>{item.allocatedAcquisitionCharges.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-700 pt-2 border-t border-gray-100">
                      <span>صافي تكلفة الوحدة:</span>
                      <span>{item.netUnitCost.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between font-black text-gray-900 pt-2 border-t border-gray-100 bg-gray-50 -mx-3 -mb-3 p-3 rounded-b-xl">
                      <span>إجمالي التكلفة النهائية:</span>
                      <span>{item.totalCost.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar (Summary & Payment) */}
        <div className="space-y-6">
          
          {/* Summary Card */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> ملخص الفاتورة
            </h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-gray-600">
                <span>إجمالي الأصناف:</span>
                <span className="font-semibold text-gray-800">{invoice.subtotal.toLocaleString()} ج.م</span>
              </div>
              
              <div className="flex justify-between items-center text-red-600">
                <span>الخصم المطبق (-):</span>
                <span className="font-semibold">{invoice.discount.toLocaleString()} ج.م</span>
              </div>

              <div className="flex justify-between items-center text-orange-600">
                <span>المصاريف والتكاليف (+):</span>
                <span className="font-semibold">{invoice.additionalCharges.toLocaleString()} ج.م</span>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">إجمالي الفاتورة:</span>
                <span className="font-black text-2xl text-blue-600">{invoice.totalAmount.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          {/* Payment & Settlement Card */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <CreditCard className="w-5 h-5 text-blue-600" /> التسوية المالية
            </h2>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">طريقة الدفع:</span>
                <span className="font-bold bg-gray-100 px-3 py-1 rounded-lg text-gray-800">
                  {getPaymentMethodText(invoice.paymentMethod)}
                </span>
              </div>

              <div className="flex justify-between items-center text-green-700 bg-green-50 p-3 rounded-lg border border-green-100">
                <span className="font-medium">المبلغ المدفوع:</span>
                <span className="font-bold text-lg">{invoice.paidAmount.toLocaleString()} ج.م</span>
              </div>

              <div className="flex justify-between items-center text-orange-700 bg-orange-50 p-3 rounded-lg border border-orange-100">
                <span className="font-medium">المتبقي (الآجل):</span>
                <span className="font-bold text-lg">{invoice.remainingAmount.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PurchaseDetails;
