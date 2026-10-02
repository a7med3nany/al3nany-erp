import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Loader2, Plus, Edit, Trash2, Store, X, CheckCircle2, 
  XCircle, AlertCircle, Search, Filter, Eye, MapPin 
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWarehouseStore } from "../../store/warehouseStore";
import { Warehouse } from "../../types";

// مخطط التحقق
const warehouseSchema = z.object({
  name: z.string().min(2, { message: "اسم المخزن مطلوب (حرفين على الأقل)" }).trim(),
  location: z.string().optional(),
  isActive: z.boolean().default(true),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export default function Warehouses() {
  const navigate = useNavigate();
  const { warehouses, isLoading, error, fetchWarehouses, addWarehouse, editWarehouse, removeWarehouse } = useWarehouseStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // حالة الفلاتر
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { isActive: true, location: "" },
  });

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // فلترة المخازن
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter(w => {
      const matchSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (w.location && w.location.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = filterStatus ? (filterStatus === 'active' ? w.isActive : !w.isActive) : true;
      return matchSearch && matchStatus;
    });
  }, [warehouses, searchTerm, filterStatus]);

  const handleOpenAdd = () => {
    setSelectedWarehouseId(null);
    setActionError(null);
    reset({ name: "", location: "", isActive: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (warehouse: Warehouse) => {
    setSelectedWarehouseId(warehouse.id);
    setActionError(null);
    reset({
      name: warehouse.name,
      location: warehouse.location || "",
      isActive: warehouse.isActive,
    });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (id: string) => {
    setSelectedWarehouseId(id);
    setActionError(null);
    setIsDeleteModalOpen(true);
  };

  const onSubmit = async (data: WarehouseFormValues) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (selectedWarehouseId) {
        await editWarehouse(selectedWarehouseId, data);
      } else {
        await addWarehouse(data);
      }
      setIsModalOpen(false);
      reset();
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedWarehouseId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await removeWarehouse(selectedWarehouseId);
      setIsDeleteModalOpen(false);
      setSelectedWarehouseId(null);
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء محاولة الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Store className="h-6 w-6" /> إدارة المخازن
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة بيانات المخازن، مواقعها، والاطلاع على أرصدتها.
          </p>
        </div>
        <button onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-sm">
          <Plus className="h-5 w-5" /> إضافة مخزن
        </button>
      </div>

      {error && !isModalOpen && !isDeleteModalOpen && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* 2. Filters */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter className="h-5 w-5" /> فلاتر البحث
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="بحث باسم المخزن أو الموقع..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-3 pr-9 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">معطل</option>
          </select>
        </div>
      </div>

      {/* 3. Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading && warehouses.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل المخازن...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-4 font-semibold">اسم المخزن</th>
                  <th className="px-4 py-4 font-semibold">الموقع</th>
                  <th className="px-4 py-4 font-semibold">الحالة</th>
                  <th className="px-4 py-4 font-semibold w-32 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredWarehouses.map((warehouse) => (
                  <tr key={warehouse.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-foreground">
                      {warehouse.name}
                    </td>
                    <td className="px-4 py-3">
                      {warehouse.location ? (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          <MapPin className="h-3.5 w-3.5" /> {warehouse.location}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {warehouse.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-bold border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded-md text-xs font-bold border border-rose-200">
                          <XCircle className="h-3 w-3" /> معطل
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {/* الزر الجديد: عرض التفاصيل والأرصدة */}
                        <button 
                          onClick={() => navigate(`/warehouses/${warehouse.id}`)} 
                          className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded transition-colors" 
                          title="عرض أرصدة المخزن"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenEdit(warehouse)} 
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors" 
                          title="تعديل"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenDelete(warehouse.id)} 
                          className="text-destructive hover:text-destructive/80 bg-destructive/10 hover:bg-destructive/20 p-1.5 rounded transition-colors" 
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredWarehouses.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      لا توجد مخازن مطابقة للبحث أو لم يتم إضافة مخازن بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Modal الإضافة/التعديل */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <h2 className="text-lg font-bold text-foreground">
                {selectedWarehouseId ? "تعديل مخزن" : "إضافة مخزن جديد"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form id="warehouseForm" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {actionError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{actionError}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">اسم المخزن <span className="text-destructive">*</span></label>
                  <input type="text" {...register("name")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="مثال: المخزن الرئيسي" />
                  {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">الموقع (اختياري)</label>
                  <input type="text" {...register("location")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="مثال: شارع الجمهورية" />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border mt-4">
                  <input type="checkbox" id="isActive" {...register("isActive")} className="h-4 w-4 text-primary rounded border-border focus:ring-primary cursor-pointer" />
                  <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                    مخزن نشط (يمكن إجراء حركات عليه)
                  </label>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
              <button form="warehouseForm" type="submit" disabled={isSubmitting} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-2 rounded-md font-medium flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal الحذف */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-foreground">هل أنت متأكد؟</h2>
              <p className="text-muted-foreground text-sm">
                سيتم حذف (إخفاء) هذا المخزن. لا يفضل حذف المخازن التي تحتوي على أرصدة أو حركات سابقة.
              </p>
              
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-xs font-semibold mt-4 text-right">
                  {actionError}
                </div>
              )}
              
              <div className="flex gap-3 pt-4 mt-2">
                <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">تراجع</button>
                <button type="button" onClick={confirmDelete} disabled={isSubmitting} className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground py-2 rounded-md font-medium flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
