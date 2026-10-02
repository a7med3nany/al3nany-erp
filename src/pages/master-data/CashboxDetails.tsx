import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  ArrowRight, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, 
  Undo2, Loader2, FileText, Wallet, CheckCircle2, XCircle, AlertCircle
} from "lucide-react";
import { useCashboxStore } from "../../store/cashboxStore";
import { useTransactionStore } from "../../store/transactionStore";
import { useAuthStore } from "../../store/authStore";
import { FinancialTransaction, TransactionType } from "../../types";

// -------------------------------------------------------------------
// مخططات التحقق (Zod Schemas)
// -------------------------------------------------------------------
const manualSchema = z.object({
  amount: z.coerce.number().positive("يجب أن يكون المبلغ رقماً أكبر من صفر"),
  description: z.string().min(2, "يرجى كتابة سبب أو وصف واضح للحركة").trim(),
});

const transferSchema = z.object({
  destinationId: z.string().min(1, "يرجى اختيار الخزينة المستقبلة"),
  amount: z.coerce.number().positive("يجب أن يكون المبلغ أكبر من صفر"),
  description: z.string().optional(),
});

const reverseSchema = z.object({
  reason: z.string().min(2, "يرجى كتابة سبب الإلغاء أو التصحيح").trim(),
});

// -------------------------------------------------------------------
// قواميس الترجمة والتنسيق
// -------------------------------------------------------------------
const txTypeLabels: Record<TransactionType, string> = {
  deposit: "إيداع نقدي",
  withdraw: "سحب نقدي",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  customer_receipt: "قبض من عميل",
  supplier_payment: "دفع لمورد",
  expense: "مصروفات",
  sales_return: "مرتجع مبيعات",
  purchase_return: "مرتجع مشتريات",
  reverse: "تسوية/تصحيح",
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(amount);
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true
  }).format(date);
};

// -------------------------------------------------------------------
// المكون الرئيسي
// -------------------------------------------------------------------
export default function CashboxDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const { cashboxes, fetchCashboxes } = useCashboxStore();
  const { 
    transactions, loading: txLoading, error: txError, 
    fetchLedger, addManualTransaction, addTransfer, reverseTx, clearTransactions 
  } = useTransactionStore();

  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | 'transfer' | 'reverse' | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // جلب البيانات الأساسية
  useEffect(() => {
    if (cashboxes.length === 0) fetchCashboxes();
    if (id) fetchLedger(id);
    return () => clearTransactions();
  }, [id, fetchCashboxes, fetchLedger, clearTransactions, cashboxes.length]);

  const cashbox = cashboxes.find(c => c.id === id);

  // حساب الإجماليات (للحركات الفعالة فقط)
  const totalIn = transactions.filter(t => t.flow === 'in' && t.status === 'active').reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter(t => t.flow === 'out' && t.status === 'active').reduce((sum, t) => sum + t.amount, 0);

  // -------------------------------------------------------------------
  // إعداد النماذج (Forms)
  // -------------------------------------------------------------------
  const { register: registerManual, handleSubmit: handleManualSubmit, reset: resetManual, formState: { errors: manualErrors } } = useForm<z.infer<typeof manualSchema>>({ resolver: zodResolver(manualSchema) });
  const { register: registerTransfer, handleSubmit: handleTransferSubmit, reset: resetTransfer, formState: { errors: transferErrors } } = useForm<z.infer<typeof transferSchema>>({ resolver: zodResolver(transferSchema) });
  const { register: registerReverse, handleSubmit: handleReverseSubmit, reset: resetReverse, formState: { errors: reverseErrors } } = useForm<z.infer<typeof reverseSchema>>({ resolver: zodResolver(reverseSchema) });

  const closeModals = () => {
    setModalType(null);
    setSelectedTxId(null);
    resetManual(); resetTransfer(); resetReverse();
  };

  // -------------------------------------------------------------------
  // معالجات الإرسال (Submit Handlers)
  // -------------------------------------------------------------------
  const onManualSubmit = async (data: z.infer<typeof manualSchema>) => {
    if (!id || !user?.email || (modalType !== 'deposit' && modalType !== 'withdraw')) return;
    setIsSubmitting(true);
    try {
      await addManualTransaction({
        cashboxId: id, type: modalType, amount: data.amount, description: data.description, createdBy: user.email
      });
      closeModals();
    } catch (err) { /* Error is handled by store and displayed in UI */ }
    finally { setIsSubmitting(false); }
  };

  const onTransferSubmit = async (data: z.infer<typeof transferSchema>) => {
    if (!id || !user?.email) return;
    setIsSubmitting(true);
    try {
      await addTransfer({
        sourceCashboxId: id, destinationCashboxId: data.destinationId, amount: data.amount, description: data.description || "", createdBy: user.email
      });
      closeModals();
    } catch (err) { }
    finally { setIsSubmitting(false); }
  };

  const onReverseSubmit = async (data: z.infer<typeof reverseSchema>) => {
    if (!selectedTxId || !user?.email) return;
    setIsSubmitting(true);
    try {
      await reverseTx({ originalTransactionId: selectedTxId, reason: data.reason, createdBy: user.email });
      closeModals();
    } catch (err) { }
    finally { setIsSubmitting(false); }
  };

  if (!cashbox) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">جاري تحميل بيانات الخزينة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* 1. رأس الشاشة */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/cashboxes')}
          className="p-2 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded-full transition-colors"
          title="العودة للخزائن"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            كشف حساب: {cashbox.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cashbox.isMain ? 'الخزينة الرئيسية' : cashbox.isDaily ? 'خزنة رصيد اليوم' : 'حساب فرعي'} 
            {' • '} الدفتر المالي وسجل الحركات
          </p>
        </div>
      </div>

      {txError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{txError}</p>
        </div>
      )}

      {/* 2. بطاقات الملخص */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-sm font-medium text-primary mb-1">الرصيد الحالي للخزينة</p>
          <p className="text-3xl font-bold text-primary font-mono" dir="ltr">{formatCurrency(cashbox.balance)}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-5 rounded-2xl">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
            <ArrowDownToLine className="h-4 w-4" /> إجمالي الداخل
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono" dir="ltr">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-5 rounded-2xl">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1">
            <ArrowUpFromLine className="h-4 w-4" /> إجمالي الخارج
          </p>
          <p className="text-2xl font-bold text-rose-700 dark:text-rose-400 font-mono" dir="ltr">{formatCurrency(totalOut)}</p>
        </div>
      </div>

      {/* 3. شريط الإجراءات (Action Bar) */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex flex-wrap gap-3">
        <button 
          onClick={() => setModalType('deposit')}
          disabled={!cashbox.isActive}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <ArrowDownToLine className="h-5 w-5" /> إيداع نقدي
        </button>
        <button 
          onClick={() => setModalType('withdraw')}
          disabled={!cashbox.isActive}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <ArrowUpFromLine className="h-5 w-5" /> سحب نقدي
        </button>
        <button 
          onClick={() => setModalType('transfer')}
          disabled={!cashbox.isActive}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <ArrowRightLeft className="h-5 w-5" /> تحويل لخزينة أخرى
        </button>
        {!cashbox.isActive && (
          <p className="w-full text-xs text-destructive flex items-center gap-1 mt-2">
            <AlertCircle className="h-3.5 w-3.5" /> الخزينة معطلة حالياً، لا يمكن تنفيذ حركات عليها.
          </p>
        )}
      </div>

      {/* 4. كشف الحساب (Ledger) */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h2 className="font-bold text-foreground">سجل الحركات المالية</h2>
          {txLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-secondary/50 text-secondary-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">التاريخ والوقت</th>
                <th className="px-4 py-3 font-semibold">نوع الحركة</th>
                <th className="px-4 py-3 font-semibold">البيان / الوصف</th>
                <th className="px-4 py-3 font-semibold">المبلغ</th>
                <th className="px-4 py-3 font-semibold">الرصيد بعد</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
                <th className="px-4 py-3 font-semibold w-24">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => {
                const isReversed = tx.status === 'reversed';
                return (
                  <tr key={tx.id} className={`hover:bg-secondary/10 transition-colors ${isReversed ? 'opacity-60 bg-secondary/20' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs" dir="ltr">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        tx.flow === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {txTypeLabels[tx.type]}
                      </span>
                    </td>
                    <td className={`px-4 py-3 max-w-xs truncate ${isReversed ? 'line-through' : ''}`} title={tx.description}>
                      {tx.description}
                      {tx.referenceType === 'correction' && (
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                          عكس لحركة رقم: {tx.referenceId?.slice(-6)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-bold" dir="ltr">
                      <span className={tx.flow === 'in' ? 'text-emerald-600' : 'text-rose-600'}>
                        {tx.flow === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-muted-foreground" dir="ltr">
                      {formatCurrency(tx.balanceAfter)}
                    </td>
                    <td className="px-4 py-3">
                      {tx.status === 'active' ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> معتمدة</span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive text-xs font-medium"><XCircle className="h-3.5 w-3.5" /> ملغية</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* زر الإلغاء يظهر فقط للحركات اليدوية الفعالة (لا يظهر للتحويلات أو الحركات الملغية أو الحركات العكسية نفسها) */}
                      {tx.status === 'active' && !['transfer_in', 'transfer_out', 'reverse'].includes(tx.type) && (
                        <button
                          onClick={() => { setSelectedTxId(tx.id); setModalType('reverse'); }}
                          className="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-1.5 rounded transition-colors"
                          title="إلغاء وتصحيح الحركة"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && !txLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد حركات مالية مسجلة لهذه الخزينة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* النوافذ المنبثقة (Modals) */}
      {/* ------------------------------------------------------------------- */}
      
      {/* 1. الإيداع / السحب */}
      {(modalType === 'deposit' || modalType === 'withdraw') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className={`px-6 py-4 border-b border-border text-white ${modalType === 'deposit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h2 className="text-lg font-bold">
                {modalType === 'deposit' ? 'إيداع نقدي' : 'سحب نقدي'}
              </h2>
            </div>
            <form onSubmit={handleManualSubmit(onManualSubmit)} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ج.م) <span className="text-destructive">*</span></label>
                <input
                  type="number" step="0.01"
                  {...registerManual("amount")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono"
                  placeholder="0.00"
                />
                {manualErrors.amount && <p className="text-destructive text-xs">{manualErrors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">البيان / الوصف <span className="text-destructive">*</span></label>
                <textarea
                  {...registerManual("description")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary"
                  placeholder="اكتب سبب الحركة بوضوح..."
                  rows={3}
                />
                {manualErrors.description && <p className="text-destructive text-xs">{manualErrors.description.message}</p>}
              </div>
              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={closeModals} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className={`flex-1 text-white py-2 rounded-md font-medium flex justify-center items-center gap-2 ${modalType === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تأكيد وحفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. التحويل */}
      {modalType === 'transfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-blue-600 text-white">
              <h2 className="text-lg font-bold">تحويل لخزينة أخرى</h2>
            </div>
            <form onSubmit={handleTransferSubmit(onTransferSubmit)} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">إلى خزينة / حساب <span className="text-destructive">*</span></label>
                <select
                  {...registerTransfer("destinationId")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary"
                >
                  <option value="">اختر الخزينة المستقبلة...</option>
                  {cashboxes.filter(c => c.id !== id && c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({txTypeLabels[c.type as TransactionType] || c.type})</option>
                  ))}
                </select>
                {transferErrors.destinationId && <p className="text-destructive text-xs">{transferErrors.destinationId.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">مبلغ التحويل (ج.م) <span className="text-destructive">*</span></label>
                <input
                  type="number" step="0.01"
                  {...registerTransfer("amount")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono"
                  placeholder="0.00"
                />
                {transferErrors.amount && <p className="text-destructive text-xs">{transferErrors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">البيان (اختياري)</label>
                <input
                  type="text"
                  {...registerTransfer("description")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary"
                  placeholder={`تحويل من ${cashbox.name}...`}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={closeModals} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium flex justify-center items-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تنفيذ التحويل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. الإلغاء / العكس (Reverse) */}
      {modalType === 'reverse' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-amber-500 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2"><Undo2 className="h-5 w-5"/> إلغاء وتصحيح حركة</h2>
            </div>
            <form onSubmit={handleReverseSubmit(onReverseSubmit)} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                <p>لن يتم حذف الحركة من قاعدة البيانات. سيتم إنشاء حركة عكسية موازية لضبط الرصيد، وسيتم تغيير حالة الحركة القديمة إلى "ملغية" لضمان الشفافية.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">سبب الإلغاء <span className="text-destructive">*</span></label>
                <textarea
                  {...registerReverse("reason")}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary"
                  placeholder="مثال: تم إدخال المبلغ بالخطأ..."
                  rows={2}
                />
                {reverseErrors.reason && <p className="text-destructive text-xs">{reverseErrors.reason.message}</p>}
              </div>
              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={closeModals} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">تراجع</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-md font-medium flex justify-center items-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تأكيد الإلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
