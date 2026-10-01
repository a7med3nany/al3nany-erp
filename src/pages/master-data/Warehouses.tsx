import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Edit, Store, MapPin, ShieldCheck, X } from "lucide-react";
import { useWarehouseStore } from "../../store/warehouseStore";
import { Warehouse } from "../../types";

// شروط التحقق من صحة بيانات المخزن
const warehouseSchema = z.object({
  name: z.string().min(2, { message: "اسم المخزن مطلوب (حرفين على الأقل)" }),
  location: z.string().optional(),
  isActive: z.boolean().default(true),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export default function Warehouses() {
  const { warehouses, isLoading, error, fetchWarehouses, createWarehouse, editWarehouse } = useWarehouseStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      isActive: true,
      location: "",
    },
  });

  // جلب المخازن عند تحميل الصفحة
  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // فتح نافذة الإضافة
  const handleOpenAdd = () => {
    setEditingId(null);
    reset({ name: "", location: "", isActive: true });
    setIsModalOpen(true);
  };

  // فتح نافذة التعديل
  const handleOpenEdit = (warehouse: Warehouse) => {
    setEditingId(warehouse.id);
    reset({
      name: warehouse.name,
      location: warehouse.location || "",
      isActive: warehouse.isActive,
    });
    setIsModalOpen(true);
  };

  // إرسال البيانات (إضافة أو تعديل)
  const onSubmit = async (data: WarehouseFormValues) => {
    setIsSubmitting(true);
    try {
      if (editingId) {
        await editWarehouse(editingId, data);
      } else {
        await createWarehouse(data);
      }
      setIsModalOpen(false);
      reset();
    } catch (err) {
      console.error("Error submitting warehouse:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Store className="h-6 w-6" />
            إدارة المخازن
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة المخازن والفروع، وإضافة مستودعات جديدة للنظام.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="h-5 w-5" />
          إضافة مخزن
        </button>
      </div>

      {/* رسالة الخطأ إن وجدت */}
      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* قائمة المخازن */}
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
                  <th className="px-6 py-4 font-semibold">اسم المخزن</th>
                  <th className="px-6 py-4 font-semibold">الموقع</th>
                  <th className="px-6 py-4 font-semibold">النوع</th>
                  <th className="px-6 py-4 font-semibold">الحالة</th>
                  <th className="px-6 py-4 font-semibold w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">
                      {warehouse.name}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {warehouse.location || "غير محدد"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {warehouse.isMain ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          مخزن رئيسي
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          مخزن فرعي
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {warehouse.isActive ? (
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          نشط
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          معطل
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleOpenEdit(warehouse)}
                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-2 rounded-md transition-colors"
                        title="تعديل بيانات المخزن"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {warehouses.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      لا توجد مخازن حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافذة الإضافة / التعديل (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "تعديل بيانات المخزن" : "إضافة مخزن جديد"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">اسم المخزن <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  {...register("name")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="مثال: فرع القاهرة"
                />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">الموقع / العنوان</label>
                <input
                  type="text"
                  {...register("location")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="مثال: شارع النيل، مبنى أ"
                />
              </div>

              {/* إخفاء زر التعطيل إذا كان هذا هو المخزن الرئيسي */}
              {editingId && warehouses.find(w => w.id === editingId)?.isMain ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-xs text-amber-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" />
                    هذا هو المخزن الرئيسي للنظام، لا يمكن تعطيله.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    {...register("isActive")}
                    className="h-4 w-4 text-primary rounded border-border focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                    مخزن نشط (متاح للاستخدام في الفواتير)
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
