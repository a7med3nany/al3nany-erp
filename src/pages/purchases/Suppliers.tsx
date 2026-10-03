import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, Edit, Eye, Power, AlertCircle, X, 
  UserX, CheckCircle2, Phone, MapPin
} from 'lucide-react';
import { useSupplierStore } from '../../store/supplierStore';
import { Supplier } from '../../types';
import { auth } from '../../config/firebase';

const Suppliers: React.FC = () => {
  const navigate = useNavigate();
  const { 
    suppliers, 
    isLoading, 
    error, 
    loadSuppliers, 
    addSupplier, 
    editSupplier, 
    toggleSupplierActive 
  } = useSupplierStore();

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation Modal State
  const [confirmToggleData, setConfirmToggleData] = useState<Supplier | null>(null);

  // Initial Load
  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Derived State (Filtering & Searching)
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(supplier => {
      const matchesSearch = 
        supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (supplier.phone && supplier.phone.includes(searchQuery)) ||
        (supplier.address && supplier.address.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = 
        statusFilter === 'all' ? true : 
        statusFilter === 'active' ? supplier.isActive === true : 
        supplier.isActive === false;

      return matchesSearch && matchesStatus;
    });
  }, [suppliers, searchQuery, statusFilter]);

  // Handlers
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingSupplier(null);
    setFormData({ name: '', phone: '', address: '' });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setModalMode('edit');
    setEditingSupplier(supplier);
    setFormData({ 
      name: supplier.name, 
      phone: supplier.phone || '', 
      address: supplier.address || '' 
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setIsModalOpen(false);
      setEditingSupplier(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    if (!formData.name.trim()) {
      setFormError('اسم المورد مطلوب');
      return;
    }

    if (modalMode === 'add') {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setFormError('يجب تسجيل الدخول أولاً لتتمكن من إضافة مورد جديد.');
        return;
      }

      setIsSubmitting(true);
      try {
        await addSupplier({
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          isActive: true,
          createdBy: currentUser.uid
        });
        setIsModalOpen(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
      } finally {
        setIsSubmitting(false);
      }
    } else if (modalMode === 'edit' && editingSupplier) {
      setIsSubmitting(true);
      try {
        await editSupplier(editingSupplier.id, {
          name: formData.name,
          phone: formData.phone,
          address: formData.address
        });
        setIsModalOpen(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggleData) return;
    setIsSubmitting(true);
    try {
      await toggleSupplierActive(confirmToggleData.id, confirmToggleData.isActive);
      setConfirmToggleData(null);
    } catch (err) {
      // Error is handled by the store
    } finally {
      setIsSubmitting(false);
    }
  };

  // UI Helpers
  const formatBalance = (balance: number) => {
    if (balance > 0) return { text: `مستحق علينا: ${balance.toLocaleString()}`, color: 'text-red-600 font-semibold' };
    if (balance < 0) return { text: `رصيد لنا: ${Math.abs(balance).toLocaleString()}`, color: 'text-green-600 font-semibold' };
    return { text: '0', color: 'text-gray-500' };
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الموردون</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة الموردين وأرصدة الحسابات وبيانات التعامل.</p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors w-full md:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة مورد</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="البحث بالاسم، الهاتف، أو العنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[150px]"
        >
          <option value="all">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">غير نشط</option>
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">حدث خطأ</h3>
            <p className="text-sm">{error}</p>
            <button 
              onClick={() => loadSuppliers()} 
              className="mt-2 text-sm text-red-600 underline hover:text-red-800"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {isLoading && suppliers.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
          <UserX className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">لا يوجد موردون حتى الآن</h3>
          <p className="text-gray-500 mb-4">قم بإضافة موردك الأول لتبدأ في تسجيل المشتريات.</p>
          <button 
            onClick={handleOpenAddModal}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            + إضافة أول مورد
          </button>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
          <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">لا توجد نتائج مطابقة</h3>
          <p className="text-gray-500">جرب تغيير كلمات البحث أو فلاتر الحالة.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">اسم المورد</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">معلومات الاتصال</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">الرصيد</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">الحالة</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSuppliers.map(supplier => {
                  const balanceDisplay = formatBalance(supplier.balance);
                  return (
                    <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">{supplier.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-sm text-gray-600">
                          {supplier.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" /> <span dir="ltr">{supplier.phone}</span></div>}
                          {supplier.address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3" /> {supplier.address}</div>}
                          {!supplier.phone && !supplier.address && <span className="text-gray-400">لا يوجد</span>}
                        </div>
                      </td>
                      <td className={`px-6 py-4 ${balanceDisplay.color}`}>
                        {balanceDisplay.text}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {supplier.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          {supplier.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button 
                            onClick={() => navigate(`/suppliers/${supplier.id}`)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleOpenEditModal(supplier)}
                            className="text-gray-400 hover:text-orange-600 transition-colors"
                            title="تعديل المورد"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => supplier.isActive ? setConfirmToggleData(supplier) : toggleSupplierActive(supplier.id, false)}
                            className={`transition-colors ${supplier.isActive ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`}
                            title={supplier.isActive ? 'تعطيل' : 'تفعيل'}
                          >
                            <Power className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="grid md:hidden gap-4">
            {filteredSuppliers.map(supplier => {
              const balanceDisplay = formatBalance(supplier.balance);
              return (
                <div key={supplier.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {supplier.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1.5">
                    {supplier.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> <span dir="ltr">{supplier.phone}</span></div>}
                    {supplier.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> <span>{supplier.address}</span></div>}
                  </div>

                  <div className={`text-sm ${balanceDisplay.color}`}>
                    الرصيد: {balanceDisplay.text}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-gray-50 mt-1">
                    <button 
                      onClick={() => navigate(`/suppliers/${supplier.id}`)}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" /> التفاصيل
                    </button>
                    <button 
                      onClick={() => handleOpenEditModal(supplier)}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-orange-600 py-2 rounded-lg text-sm transition-colors"
                    >
                      <Edit className="w-4 h-4" /> تعديل
                    </button>
                    <button 
                      onClick={() => supplier.isActive ? setConfirmToggleData(supplier) : toggleSupplierActive(supplier.id, false)}
                      className={`flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 py-2 rounded-lg text-sm transition-colors ${supplier.isActive ? 'text-red-600' : 'text-green-600'}`}
                    >
                      <Power className="w-4 h-4" /> {supplier.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden dir-rtl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-800">
                {modalMode === 'add' ? 'إضافة مورد جديد' : 'تعديل بيانات المورد'}
              </h2>
              <button 
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="شركة الأمل للتجارة..."
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-right"
                  placeholder="010..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">العنوان</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none"
                  rows={3}
                  placeholder="العنوان التفصيلي..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-10"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'حفظ البيانات'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 h-10"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal (Toggle Active) */}
      {confirmToggleData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 dir-rtl">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">تأكيد تعطيل المورد</h3>
              <p className="text-gray-500 text-sm">
                هل أنت متأكد من رغبتك في تعطيل المورد <span className="font-semibold text-gray-700">"{confirmToggleData.name}"</span>؟ 
                لن تتمكن من استخدامه في معاملات جديدة حتى يتم تفعيله مجدداً.
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleConfirmToggle}
                disabled={isSubmitting}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 h-10 flex items-center justify-center"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'نعم، قم بالتعطيل'}
              </button>
              <button
                onClick={() => setConfirmToggleData(null)}
                disabled={isSubmitting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 h-10"
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

export default Suppliers;
