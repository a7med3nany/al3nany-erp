import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, Edit, Eye, Power, AlertCircle, X, 
  UserX, CheckCircle2, Phone, MapPin, Users, Wallet,
  TrendingDown, TrendingUp, Building2
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

  // Derived State (Statistics)
  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let owedToSupplier = 0; // مستحق علينا (Balance > 0)
    let creditForUs = 0; // رصيد لنا (Balance < 0)

    suppliers.forEach(s => {
      if (s.isActive) active++;
      else inactive++;

      if (s.balance > 0) owedToSupplier += s.balance;
      else if (s.balance < 0) creditForUs += Math.abs(s.balance);
    });

    return {
      total: suppliers.length,
      active,
      inactive,
      owedToSupplier,
      creditForUs
    };
  }, [suppliers]);

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
    if (balance > 0) return { text: `مستحق علينا: ${balance.toLocaleString()} ج.م`, color: 'text-rose-600', badgeBg: 'bg-rose-50 border-rose-200' };
    if (balance < 0) return { text: `رصيد لنا: ${Math.abs(balance).toLocaleString()} ج.م`, color: 'text-emerald-600', badgeBg: 'bg-emerald-50 border-emerald-200' };
    return { text: 'متوازن (0 ج.م)', color: 'text-slate-500', badgeBg: 'bg-slate-50 border-slate-200' };
  };

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            الموردون
          </h1>
          <p className="text-slate-500 text-sm mt-1">إدارة الموردين وأرصدة الحسابات وبيانات التعامل.</p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-sm shadow-blue-600/20 font-medium w-full md:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة مورد</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-600">إجمالي الموردين</span>
          </div>
          <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-600">نشط / غير نشط</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.active}</span>
            <span className="text-sm font-medium text-slate-400">/ {stats.inactive}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-rose-50 p-2 rounded-lg text-rose-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-600">مستحق علينا</span>
          </div>
          <span className="text-xl font-bold text-rose-600">{stats.owedToSupplier.toLocaleString()} ج.م</span>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <TrendingDown className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-600">رصيد لنا</span>
          </div>
          <span className="text-xl font-bold text-emerald-600">{stats.creditForUs.toLocaleString()} ج.م</span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="ابحث باسم المورد، الهاتف، أو العنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
          />
        </div>
        
        {/* Segmented Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-xl overflow-x-auto hide-scrollbar shrink-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            الكل <span className="bg-slate-200 text-slate-600 py-0.5 px-2 rounded-md text-xs">{stats.total}</span>
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            نشط <span className="bg-emerald-100 text-emerald-700 py-0.5 px-2 rounded-md text-xs">{stats.active}</span>
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'inactive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            غير نشط <span className="bg-slate-200 text-slate-700 py-0.5 px-2 rounded-md text-xs">{stats.inactive}</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">حدث خطأ</h3>
            <p className="text-sm opacity-90">{error}</p>
            <button 
              onClick={() => loadSuppliers()} 
              className="mt-2 text-sm text-rose-700 font-bold underline hover:text-rose-900"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {isLoading && suppliers.length === 0 ? (
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">جاري تحميل الموردين...</p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserX className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">لا يوجد موردون حتى الآن</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">قم بإضافة موردك الأول لتبدأ في تسجيل المشتريات ومتابعة الأرصدة.</p>
          <button 
            onClick={handleOpenAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            + إضافة أول مورد
          </button>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">لا توجد نتائج مطابقة</h3>
          <p className="text-slate-500 mb-4">جرب تغيير كلمات البحث أو الفلاتر المستخدمة.</p>
          <button 
            onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
            className="text-blue-600 hover:text-blue-800 font-medium underline"
          >
            مسح الفلاتر
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">المورد</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">بيانات الاتصال</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">الرصيد المالي</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">الحالة</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map(supplier => {
                  const balanceDisplay = formatBalance(supplier.balance);
                  return (
                    <tr key={supplier.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-100 shrink-0">
                            {getInitials(supplier.name)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{supplier.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 text-sm text-slate-600">
                          {supplier.phone ? (
                            <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> <span dir="ltr">{supplier.phone}</span></div>
                          ) : null}
                          {supplier.address ? (
                            <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {supplier.address}</div>
                          ) : null}
                          {!supplier.phone && !supplier.address && <span className="text-slate-400 italic">لا توجد بيانات اتصال</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex px-3 py-1.5 rounded-lg border ${balanceDisplay.badgeBg}`}>
                          <span className={`text-sm font-bold ${balanceDisplay.color}`}>{balanceDisplay.text}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          supplier.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {supplier.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          {supplier.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => navigate(`/suppliers/${supplier.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50 rounded-lg transition-all text-sm font-medium shadow-sm"
                          >
                            <Eye className="w-4 h-4" /> التفاصيل
                          </button>
                          <button 
                            onClick={() => handleOpenEditModal(supplier)}
                            className="p-1.5 text-slate-400 hover:text-orange-600 bg-white border border-slate-200 hover:border-orange-200 hover:bg-orange-50 rounded-lg transition-all shadow-sm"
                            title="تعديل المورد"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => supplier.isActive ? setConfirmToggleData(supplier) : toggleSupplierActive(supplier.id, false)}
                            className={`p-1.5 bg-white border border-slate-200 rounded-lg transition-all shadow-sm ${
                              supplier.isActive ? 'text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50'
                            }`}
                            title={supplier.isActive ? 'تعطيل' : 'تفعيل'}
                          >
                            <Power className="w-4 h-4" />
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
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredSuppliers.map(supplier => {
              const balanceDisplay = formatBalance(supplier.balance);
              return (
                <div key={supplier.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-100 shrink-0">
                        {getInitials(supplier.name)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{supplier.name}</h3>
                        <span className={`inline-flex mt-1 items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          supplier.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {supplier.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-slate-600 space-y-2">
                    {supplier.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> <span dir="ltr">{supplier.phone}</span></div>}
                    {supplier.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> <span>{supplier.address}</span></div>}
                  </div>

                  <div className={`text-sm p-3 rounded-xl border ${balanceDisplay.badgeBg}`}>
                    <span className={`font-bold ${balanceDisplay.color}`}>{balanceDisplay.text}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button 
                      onClick={() => navigate(`/suppliers/${supplier.id}`)}
                      className="col-span-3 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-sm font-medium border border-slate-200 transition-colors shadow-sm"
                    >
                      <Eye className="w-4 h-4" /> عرض التفاصيل بالكامل
                    </button>
                    <button 
                      onClick={() => handleOpenEditModal(supplier)}
                      className="col-span-1.5 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-orange-200 hover:bg-orange-50 text-orange-600 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
                    >
                      <Edit className="w-4 h-4" /> تعديل
                    </button>
                    <button 
                      onClick={() => supplier.isActive ? setConfirmToggleData(supplier) : toggleSupplierActive(supplier.id, false)}
                      className={`col-span-1.5 flex items-center justify-center gap-2 bg-white border border-slate-200 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm ${
                        supplier.isActive ? 'text-rose-600 hover:bg-rose-50 hover:border-rose-200' : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                      }`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {modalMode === 'add' ? <Plus className="w-5 h-5 text-blue-600" /> : <Edit className="w-5 h-5 text-blue-600" />}
                {modalMode === 'add' ? 'إضافة مورد جديد' : 'تعديل بيانات المورد'}
              </h2>
              <button 
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm border border-rose-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-medium">{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">اسم المورد <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                  placeholder="شركة الأمل للتجارة..."
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">رقم الهاتف</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-right font-medium"
                  placeholder="010..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">العنوان</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none font-medium"
                  rows={3}
                  placeholder="العنوان التفصيلي..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="pt-5 flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex justify-center items-center shadow-sm shadow-blue-600/20"
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
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 dir-rtl text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Power className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">تأكيد تعطيل المورد</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              هل أنت متأكد من رغبتك في تعطيل المورد <span className="font-bold text-slate-800">"{confirmToggleData.name}"</span>؟ 
              لن تتمكن من استخدامه في معاملات جديدة حتى يتم تفعيله مجدداً.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={handleConfirmToggle}
                disabled={isSubmitting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center shadow-sm shadow-rose-600/20"
              >
                {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'نعم، قم بالتعطيل'}
              </button>
              <button
                onClick={() => setConfirmToggleData(null)}
                disabled={isSubmitting}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
