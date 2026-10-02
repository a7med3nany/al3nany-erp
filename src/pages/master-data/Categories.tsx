import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Edit, Trash2, Tags, X, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useCategoryStore } from "../../store/categoryStore";
import { Category } from "../../types";

const categorySchema = z.object({
  name: z.string().min(2, { message: "اسم الفئة مطلوب (حرفين على الأقل)" }).trim(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function Categories() {
  const { categories, isLoading, error, fetchCategories, addCategory, editCategory, removeCategory } = useCategoryStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { isActive: true, description: "" },
  });

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenAdd = () => {
    setSelectedCategoryId(null);
    setActionError(null);
    reset({ name: "", description: "", isActive: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setSelectedCategoryId(category.id);
    setActionError(null);
    reset({ name: category.name, description: category.description || "", isActive: category.isActive });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (id: string) => {
    setSelectedCategoryId(id);
    setActionError(null);
    setIsDeleteModalOpen(true);
  };

  const onSubmit = async (data: CategoryFormValues) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (selectedCategoryId) {
        await editCategory(selectedCategoryId, data);
      } else {
        await addCategory(data);
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
    if (!selectedCategoryId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await removeCategory(selectedCategoryId);
      setIsDeleteModalOpen(false);
      setSelectedCategoryId(null);
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء محاولة الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Tags className="h-6 w-6" /> فئات الأصناف
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة أقسام وتصنيفات المنتجات لتنظيم المخزون والمبيعات.
          </p>
        </div>
        <button onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-sm">
          <Plus className="h-5 w-5" /> إضافة فئة جديدة
        </button>
      </div>

      {error && !isModalOpen && !isDeleteModalOpen && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading && categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل الفئات...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">اسم الفئة</th>
                  <th className="px-6 py-4 font-semibold">الوصف</th>
                  <th className="px-6 py-4 font-semibold">الحالة</th>
                  <th className="px-6 py-4 font-semibold w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{cat.name}</td>
                    <td className="px-6 py-4 text-muted-foreground max-w-xs truncate" title={cat.description}>{cat.description || '-'}</td>
                    <td className="px-6 py-4">
                      {cat.isActive ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <XCircle className="h-3.5 w-3.5" /> معطل
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenEdit(cat)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-2 rounded-md transition-colors" title="تعديل">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleOpenDelete(cat.id)} className="text-destructive hover:text-destructive/80 bg-destructive/10 hover:bg-destructive/20 p-2 rounded-md transition-colors" title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                      لا توجد فئات مسجلة حالياً. اضغط على "إضافة فئة جديدة" للبدء.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal إضافة/تعديل */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <h2 className="text-lg font-bold text-foreground">
                {selectedCategoryId ? "تعديل فئة" : "إضافة فئة جديدة"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{actionError}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">اسم الفئة <span className="text-destructive">*</span></label>
                <input type="text" {...register("name")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="مثال: شواحن، كابلات، سماعات..." />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">الوصف (اختياري)</label>
                <textarea {...register("description")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="ملاحظات حول هذا القسم..." rows={2} />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isActive" {...register("isActive")} className="h-4 w-4 text-primary rounded border-border focus:ring-primary cursor-pointer" />
                <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                  فئة نشطة (تظهر في قائمة المبيعات والمشتريات)
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-2 rounded-md font-medium flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تأكيد الحذف */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-foreground">هل أنت متأكد؟</h2>
              <p className="text-muted-foreground text-sm">
                سيتم إخفاء هذه الفئة من النظام (حذف ناعم). لا يمكن إتمام هذا الإجراء إذا كانت هناك منتجات فعالة مرتبطة بها.
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
