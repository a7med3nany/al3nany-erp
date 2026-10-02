import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Edit, Wallet, Landmark, Smartphone, Banknote, ShieldCheck, Clock, X, CreditCard, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCashboxStore } from "../../store/cashboxStore";
import { Cashbox, CashboxType } from "../../types";

// شروط التحقق من صحة بيانات الخزينة
const cashboxSchema = z.object({
  name: z.string().min(2, { message: "اسم الخزينة/الحساب مطلوب (حرفين على الأقل)" }),
  type: z.enum(['cash', 'bank', 'wallet', 'digital'], { required_error: "يرجى اختيار نوع الحساب" }),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CashboxFormValues = z.infer<typeof cashboxSchema>;

// قاموس لترجمة أنواع الخزائن مع الأيقونات المناسبة
const cashboxTypeDetails: Record<CashboxType, { label: string; icon: JSX.Element; color: string }> = {
  cash: { label: "نقدية (كاش)", icon: <Banknote className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-100" },
  bank: { label: "حساب بنكي", icon: <Landmark className="h-4 w-4" />, color: "text-blue-600 bg-blue-100" },
  wallet: { label: "محفظة إلكترونية", icon: <Smartphone className="h-4 w-4" />, color: "text-purple-600 bg-purple-100" },
  digital: { label: "دفع إلكتروني", icon: <CreditCard className="h-4 w-4" />, color: "text-indigo-600 bg-indigo-100" },
};

export default function Cashboxes() {
  const navigate = useNavigate();
  const { cashboxes, isLoading, error, fetchCashboxes, createCashbox, editCashbox } = useCashboxStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CashboxFormValues>({
    resolver: zodResolver(cashboxSchema),
    defaultValues: {
      isActive: true,
      description: "",
      type: "cash",
    },
  });

  useEffect(() => {
    fetchCashboxes();
  }, [fetchCashboxes]);

  const handleOpenAdd = () => {
    setEditingId(null);
    reset({ name: "", description: "", type: "cash", isActive: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cashbox: Cashbox) => {
    setEditingId(cashbox.id);
    reset({
      name: cashbox.name,
      description: cashbox.description || "",
      type: cashbox.type,
      isActive: cashbox.isActive,
    });
    setIsModalOpen(true);
  };

  const onSubmit = async (data: CashboxFormValues) => {
    setIsSubmitting(true);
    try {
      if (editingId) {
        await editCashbox(editingId, data);
      } else {
        await createCashbox(data);
      }
      setIsModalOpen(false);
      reset();
    } catch (err) {
      console.error("Error submitting cashbox:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    }).format(amount);
  };

  const editingCashbox = editingId ? cashboxes.find(c => c.id === editingId) : null;
  const isProtected = editingCashbox?.isMain || editingCashbox?.isDaily;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            إدارة الخزائن والحسابات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة النقدية، الحسابات البنكية، والمحافظ الإلكترونية، ومراقبة الأرصدة.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="h-5 w-5" />
          إضافة حساب/خزينة
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading && cashboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل الحسابات...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">اسم الحساب</th>
                  <th className="px-6 py-4 font-semibold">النوع</th>
                  <th className="px-6 py-4 font-semibold">التصنيف</th>
                  <th className="px-6 py-4 font-semibold">الرصيد المحسوب</th>
                  <th className="px-6 py-4 font-semibold">الحالة</th>
                  <th className="px-6 py-4 font-semibold w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cashboxes.map((cashbox) => (
                  <tr key={cashbox.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-foreground">{cashbox.name}</p>
                      {cashbox.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{cashbox.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cashboxTypeDetails[cashbox.type].color}`}>
                        {cashboxTypeDetails[cashbox.type].icon}
                        {cashboxTypeDetails[cashbox.type].label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {cashbox.isMain ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-md text-xs font-semibold border border-amber-200">
                          <ShieldCheck className="h-3.5 w-3.5" /> الخزينة الرئيسية
                        </span>
                      ) : cashbox.isDaily ? (
                        <span className="inline-flex items-center gap-1 text-sky-700 bg-sky-50 px-2 py-1 rounded-md text-xs font-semibold border border-sky-200">
                          <Clock className="h-3.5 w-3.5" /> خزنة رصيد اليوم
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">حساب فرعي</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-base text-foreground font-mono" dir="ltr">
                        {formatCurrency(cashbox.balance)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {cashbox.isActive ? (
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/cashboxes/${cashbox.id}`)}
                          className="text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 p-2 rounded-md transition-colors"
                          title="كشف الحساب التفصيلي"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cashbox)}
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-2 rounded-md transition-colors"
                          title="تعديل بيانات الحساب"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {cashboxes.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      لا توجد حسابات حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "تعديل بيانات الحساب" : "إضافة حساب جديد"}
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
                <label className="text-sm font-medium text-foreground">اسم الخزينة/الحساب <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  {...register("name")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="مثال: البنك الأهلي، فودافون كاش كذا..."
                />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">نوع الحساب <span className="text-destructive">*</span></label>
                <select
                  {...register("type")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all appearance-none cursor-pointer"
                >
                  <option value="cash">نقدية (كاش درج)</option>
                  <option value="bank">حساب بنكي</option>
                  <option value="wallet">محفظة إلكترونية (فودافون كاش ونحوه)</option>
                  <option value="digital">دفع إلكتروني (إنستاباي ونحوه)</option>
                </select>
                {errors.type && <p className="text-destructive text-xs">{errors.type.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">الوصف / رقم الحساب (اختياري)</label>
                <input
                  type="text"
                  {...register("description")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="أدخل أي ملاحظات أو رقم الحساب..."
                />
              </div>

              {isProtected ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md mt-4">
                  <p className="text-xs text-amber-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    هذا الحساب أساسي في النظام، لا يمكن إيقافه لتجنب حدوث خلل مالي.
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
                    حساب نشط (متاح للاستخدام في السداد والتحصيل)
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
