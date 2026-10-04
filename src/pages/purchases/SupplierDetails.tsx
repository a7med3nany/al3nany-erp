import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Edit, Power, AlertCircle, X, 
  CheckCircle2, Phone, MapPin, FileText, 
  TrendingUp, TrendingDown, Banknote
} from 'lucide-react';
import { useSupplierStore } from '../../store/supplierStore';
import { Supplier, SupplierTransaction } from '../../types';

const SupplierDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentSupplier,
    supplierLedger,
    isLoading,
    error,
    loadSupplier,
    loadSupplierLedger,
    editSupplier,
    toggleSupplierActive,
    clearCurrentData
  } = useSupplierStore();

  // Modal State for Editing Supplier
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation Modal State for Deactivation
  const [showConfirmDisable, setShowConfirmDisable] = useState(false);
  const [toggleError, setToggleError] = useState('');

  // Ref for Auto-scrolling to the latest transaction at the bottom
  const ledgerBottomRef = useRef<HTMLDivElement>(null);

  // Load Data on Mount or ID change
  useEffect(() => {
    if (id) {
      loadSupplier(id);
      loadSupplierLedger(id);
    }
    return () => {
      clearCurrentData();
    };
  }, [id, loadSupplier, loadSupplierLedger, clearCurrentData]);

  // Scroll to bottom of ledger on ledger update or load
  useEffect(() => {
    if (supplierLedger.length > 0) {
      ledgerBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [supplierLedger]);

  // Handlers for Edit Modal
  const handleOpenEditModal = () => {
    if (currentSupplier) {
      setFormData({
        name: currentSupplier.name,
        phone: currentSupplier.phone || '',
        address: currentSupplier.address || ''
      });
      setFormError('');
      setIsEditModalOpen(true);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !currentSupplier) return;
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('اسم المورد مطلوب');
      return;
    }

    setIsSubmitting(true);
    try {
      await editSupplier(id, {
        name: formData.name,
        phone: formData.phone,
        address: formData.address
      });
      setIsEditModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء تعديل بيانات المورد');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Active/Inactive Toggle
  const handleToggleActive = async () => {
    if (!id || !currentSupplier) return;
    setToggleError('');
    if (currentSupplier.isActive) {
      setShowConfirmDisable(true);
    } else {
      // Direct activation
      setIsSubmitting(true);
      try {
        await toggleSupplierActive(id, currentSupplier.isActive);
      } catch (err) {
        setToggleError(
          err instanceof Error
            ? err.message
            : 'حدث خطأ أثناء تغيير حالة المورد'
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleConfirmDisable = async () => {
    if (!id || !currentSupplier) return;
    setToggleError('');
    setIsSubmitting(true);
    try {
      await toggleSupplierActive(id, currentSupplier.isActive);
      setShowConfirmDisable(false);
    } catch (err) {
      setToggleError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تغيير حالة المورد'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Accounting Balance Formatter
  const formatBalance = (balance: number) => {
    if (balance > 0) return { text: `مستحق علينا: ${balance.toLocaleString()} ج.م`, color: 'text-red-600 bg-red-50 border-red-100' };
    if (balance < 0) return { text: `رصيد لنا: ${Math.abs(balance).toLocaleString()} ج.م`, color: 'text-green-600 bg-green-50 border-green-100' };
    return { text: 'متزن (0 ج.م)', color: 'text-gray-600 bg-gray-50 border-gray-100' };
  };

  // UI Helpers for Ledger
  const formatReferenceType = (refType: string) => {
    switch (refType) {
      case 'purchase_invoice': return 'فاتورة مشتريات';
      case 'purchase_return': return 'مرتجع مشتريات';
      case 'supplier_payment': return 'سداد للمورد';
      case 'opening_balance': return 'رصيد افتتاحى';
      default: return refType;
    }
  };

  if (isLoading && !currentSupplier) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !currentSupplier) {
    return (
      <div className="container mx-auto p-6 dir-rtl">
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h2 className="text-lg font-bold">عذراً، حدث خطأ</h2>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => id && loadSupplier(id)} 
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!currentSupplier) {
    return (
      <div className="container mx-auto p-6 text-center py-20 dir-rtl">
        <h2 className="text-xl font-bold text-gray-800 mb-2">المورد غير موجود</h2>
        <p className="text-gray-500 mb-6">المورد المطلوب غير مسجل أو تم حذف الرابط.</p>
        <button 
          onClick={() => navigate('/suppliers')}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" /> العودة لقائمة الموردين
        </button>
      </div>
    );
  }

  const balanceInfo = formatBalance(currentSupplier.balance);

  // Reverse ledger array to show Oldest at Top and Newest at Bottom (as required)
  const chronologicalLedger = [...supplierLedger].reverse();

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl">
      {/* Top Bar / Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button
          onClick={() => navigate('/suppliers')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors font-medium text-sm bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
        >
          <ArrowRight className="w-4 h-4" />
          العودة لقائمة الموردين
        </button>

        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => navigate(`/suppliers/${id}/payment`)}
              className="flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Banknote className="w-4 h-4" />
              تسجيل دفعة
            </button>
            
            <button
              onClick={handleOpenEditModal}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Edit className="w-4 h-4 text-orange-600" />
              تعديل البيانات
            </button>
            
            <button
              onClick={handleToggleActive}
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${
                currentSupplier.isActive 
                  ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50' 
                  : 'bg-white border border-green-200 text-green-600 hover:bg-green-50'
              }`}
            >
              <Power className="w-4 h-4" />
              {currentSupplier.isActive ? 'تعطيل المورد' : 'تفعيل المورد'}
            </button>
          </div>
          {toggleError && !showConfirmDisable && (
            <span className="text-xs text-red-600 font-medium">{toggleError}</span>
          )}
        </div>
      </div>

      {/* Supplier Profile Info Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{currentSupplier.name}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              currentSupplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {currentSupplier.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
              {currentSupplier.isActive ? 'نشط' : 'غير نشط'}
            </span>
          </div>

          <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-gray-600 pt-1">
            {currentSupplier.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span dir="ltr">{currentSupplier.phone}</span>
              </div>
            )}
            {currentSupplier.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{currentSupplier.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Balance Display Card */}
        <div className={`rounded-xl p-4 border flex flex-col justify-center items-start gap-1 ${balanceInfo.color}`}>
          <span className="text-xs font-semibold opacity-80 uppercase tracking-wider">الرصيد المالي الحالي</span>
          <span className="text-xl font-bold">{balanceInfo.text}</span>
        </div>
      </div>

      {/* Supplier Ledger Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="p-4 md:p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">كشف حساب المورد</h2>
            <p className="text-xs text-gray-500 mt-0.5">عرض متسلسل لحركات المورد المالية (من الأقدم للأحدث)</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            إجمالي الحركات: {supplierLedger.length}
          </span>
        </div>

        {supplierLedger.length === 0 ? (
          <div className="text-center py-16 text-gray-400 space-y-2">
            <FileText className="w-12 h-12 mx-auto stroke-1 text-gray-300" />
            <p className="font-medium text-gray-600">لا توجد حركات مالية مسجلة لهذا المورد حتى الآن.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto p-4 md:p-6 space-y-4">
            {/* Desktop Table Format */}
            <div className="hidden md:block">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <th className="pb-3 px-3">التاريخ والوقت</th>
                    <th className="pb-3 px-3">نوع المرجع</th>
                    <th className="pb-3 px-3">الوصف</th>
                    <th className="pb-3 px-3">نوع الحركة</th>
                    <th className="pb-3 px-3">المبلغ</th>
                    <th className="pb-3 px-3">الرصيد بعد الحركة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {chronologicalLedger.map((tx: SupplierTransaction) => {
                    const isDebit = tx.type === 'in'; // in = زيادة المديونية
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-3 text-gray-500 whitespace-nowrap text-xs">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString('ar-EG') : '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-block bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded text-xs font-medium">
                            {formatReferenceType(tx.referenceType)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-800 max-w-xs truncate" title={tx.description}>
                          {tx.description || 'بدون وصف'}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isDebit ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                          }`}>
                            {isDebit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isDebit ? 'إثبات التزام (in)' : 'سداد/تسوية (out)'}
                          </span>
                        </td>
                        <td className={`py-3 px-3 font-semibold ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                          {isDebit ? '+' : '-'}{tx.amount.toLocaleString()} ج.م
                        </td>
                        <td className="py-3 px-3 font-bold text-gray-900">
                          {tx.balanceAfter.toLocaleString()} ج.م
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards Format */}
            <div className="grid md:hidden gap-3">
              {chronologicalLedger.map((tx: SupplierTransaction) => {
                const isDebit = tx.type === 'in';
                return (
                  <div key={tx.id} className="bg-gray-50/70 border border-gray-100 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-start text-xs text-gray-500">
                      <span>{tx.createdAt ? new Date(tx.createdAt).toLocaleString('ar-EG') : '-'}</span>
                      <span className="bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-700 font-medium">
                        {formatReferenceType(tx.referenceType)}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-gray-800">{tx.description || 'بدون وصف'}</p>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-200/60 text-sm">
                      <span className={`font-semibold flex items-center gap-1 ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                        {isDebit ? '+' : '-'}{tx.amount.toLocaleString()} ج.م
                      </span>
                      <div className="text-xs text-gray-500 text-left">
                        <span>الرصيد بعد: </span>
                        <span className="font-bold text-gray-800">{tx.balanceAfter.toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scroll anchor to keep latest transaction at the bottom */}
            <div ref={ledgerBottomRef} />
          </div>
        )}
      </div>

      {/* Edit Supplier Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden dir-rtl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-800">تعديل بيانات المورد</h2>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
              {formError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">اسم المورد <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">رقم الهاتف</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">العنوان</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 h-10 flex justify-center items-center"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors h-10"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deactivation */}
      {showConfirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 dir-rtl">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">تأكيد تعطيل المورد</h3>
              <p className="text-gray-500 text-sm">
                هل أنت متأكد من رغبتك في تعطيل المورد <span className="font-semibold text-gray-700">"{currentSupplier.name}"</span>؟ لن تتمكن من إجراء تعاملات جديدة معه حتى يتم تفعيله مجدداً.
              </p>
              {toggleError && (
                <div className="w-full bg-red-50 text-red-600 p-2 rounded-lg text-xs border border-red-100 mt-2">
                  {toggleError}
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleConfirmDisable}
                disabled={isSubmitting}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 h-10 flex items-center justify-center"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'نعم، قم بالتعطيل'}
              </button>
              <button
                onClick={() => {
                  setShowConfirmDisable(false);
                  setToggleError('');
                }}
                disabled={isSubmitting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors h-10"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierDetails;
