import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  ArrowRight, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, 
  Undo2, Loader2, FileText, CheckCircle2, XCircle, AlertCircle, 
  Search, Filter, Eye, Calendar, User, Hash, Info
} from "lucide-react";
import { useCashboxStore } from "../../store/cashboxStore";
import { useTransactionStore } from "../../store/transactionStore";
import { useAuthStore } from "../../store/authStore";
import { FinancialTransaction, TransactionType, TransactionStatus } from "../../types";

// -------------------------------------------------------------------
// مخططات التحقق (Zod Schemas)
// -------------------------------------------------------------------
const manualSchema = z.object({
  amount: z.coerce.number().positive("يجب أن يكون المبلغ أكبر من صفر"),
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
  reverse: "حركة تصحيحية",
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
    fetchLedger, addManualTransaction, addTransfer, reverseTx, reverseTransferTx, clearTransactions 
  } = useTransactionStore();

  // حالة النوافذ المنبثقة
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | 'transfer' | 'reverse_manual' | 'reverse_transfer' | 'details' | null>(null);
  const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // حالة الفلاتر
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // جلب البيانات الأساسية
  useEffect(() => {
    if (cashboxes.length === 0) fetchCashboxes();
    if (id) fetchLedger(id);
    return () => clearTransactions();
  }, [id, fetchCashboxes, fetchLedger, clearTransactions, cashboxes.length]);

  const cashbox = cashboxes.find(c => c.id === id);

  // -------------------------------------------------------------------
  // الفلترة الديناميكية وحساب الإجماليات
  // -------------------------------------------------------------------
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // بحث نصي
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        tx.description.toLowerCase().includes(searchLower) ||
        tx.referenceId?.toLowerCase().includes(searchLower) ||
        tx.counterpartCashboxName?.toLowerCase().includes(searchLower);
      
      // فلاتر القوائم المنسدلة
      const matchType = filterType ? tx.type === filterType : true;
      const matchStatus = filterStatus ? tx.status === filterStatus : true;
      
      // فلتر التاريخ
      const txDate = new Date(tx.createdAt);
      const from = dateFrom ? new Date(dateFrom) : null;
      if (from) from.setHours(0, 0, 0, 0);
      const to = dateTo ? new Date(dateTo) : null;
      if (to) to.setHours(23, 59, 59, 999);
      
      const matchDateFrom = from ? txDate >= from : true;
      const matchDateTo = to ? txDate <= to : true;

      return matchSearch && matchType && matchStatus && matchDateFrom && matchDateTo;
    });
  }, [transactions, searchTerm, filterType, filterStatus, dateFrom, dateTo]);

  // حساب الإجماليات للحركات الفعالة فقط (تستبعد الملغية reversed، وتشمل الحركات العكسية reverse)
  const { totalIn, totalOut } = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    filteredTransactions.forEach(tx => {
      if (tx.status === 'reversed') return; // لا تدخل في الحسبة نهائياً
      if (tx.flow === 'in') inSum += tx.amount;
      if (tx.flow === 'out') outSum += tx.amount;
    });
    return { totalIn: inSum, totalOut: outSum };
  }, [filteredTransactions]);

  // -------------------------------------------------------------------
  // إعداد النماذج (Forms)
  // -------------------------------------------------------------------
  const { register: registerManual, handleSubmit: handleManualSubmit, reset: resetManual, formState: { errors: manualErrors } } = useForm<z.infer<typeof manualSchema>>({ resolver: zodResolver(manualSchema) });
  const { register: registerTransfer, handleSubmit: handleTransferSubmit, reset: resetTransfer, formState: { errors: transferErrors } } = useForm<z.infer<typeof transferSchema>>({ resolver: zodResolver(transferSchema) });
  const { register: registerReverse, handleSubmit: handleReverseSubmit, reset: resetReverse, formState: { errors: reverseErrors } } = useForm<z.infer<typeof reverseSchema>>({ resolver: zodResolver(reverseSchema) });

  const closeModals = () => {
    setModalType(null);
    setSelectedTx(null);
    resetManual(); resetTransfer(); resetReverse();
  };

  // -------------------------------------------------------------------
  // معالجات الإرسال (Submit Handlers)
  // -------------------------------------------------------------------
  const onManualSubmit = async (data: z.infer<typeof manualSchema>) => {
    if (!id || !user?.email || (modalType !== 'deposit' && modalType !== 'withdraw')) return;
    setIsSubmitting(true);
    try {
      await addManualTransaction({ cashboxId: id, type: modalType, amount: data.amount, description: data.description, createdBy: user.email });
      closeModals();
    } catch (err) { } finally { setIsSubmitting(false); }
  };

  const onTransferSubmit = async (data: z.infer<typeof transferSchema>) => {
    if (!id || !user?.email) return;
    setIsSubmitting(true);
    try {
      await addTransfer({ sourceCashboxId: id, destinationCashboxId: data.destinationId, amount: data.amount, description: data.description || "", createdBy: user.email });
      closeModals();
    } catch (err) { } finally { setIsSubmitting(false); }
  };

  const onReverseSubmit = async (data: z.infer<typeof reverseSchema>) => {
    if (!selectedTx || !user?.email) return;
    setIsSubmitting(true);
    try {
      if (modalType === 'reverse_manual') {
        await reverseTx({ originalTransactionId: selectedTx.id, reason: data.reason, createdBy: user.email });
      } else if (modalType === 'reverse_transfer' && selectedTx.transferId) {
        await reverseTransferTx({ transferId: selectedTx.transferId, reason: data.reason, createdBy: user.email });
      }
      closeModals();
    } catch (err) { } finally { setIsSubmitting(false); }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/cashboxes')} className="p-2 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded-full transition-colors" title="العودة">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> كشف حساب: {cashbox.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">الدفتر المالي وسجل الحركات</p>
          </div>
        </div>
      </div>

      {txError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{txError}</p>
        </div>
      )}

      {/* 2. شريط الإجراءات (Action Bar) */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex flex-wrap gap-3">
        <button onClick={() => setModalType('deposit')} disabled={!cashbox.isActive} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
          <ArrowDownToLine className="h-5 w-5" /> إيداع نقدي
        </button>
        <button onClick={() => setModalType('withdraw')} disabled={!cashbox.isActive} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
          <ArrowUpFromLine className="h-5 w-5" /> سحب نقدي
        </button>
        <button onClick={() => setModalType('transfer')} disabled={!cashbox.isActive} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
          <ArrowRightLeft className="h-5 w-5" /> تحويل لخزينة أخرى
        </button>
      </div>

      {/* 3. شريط الفلاتر (Filters) */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter className="h-5 w-5" /> فلاتر البحث
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="بحث بالبيان، المرجع، الخزينة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-3 pr-9 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
            <option value="">كل الأنواع</option>
            {Object.entries(txTypeLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
            <option value="">كل الحالات</option>
            <option value="active">معتمدة/فعالة</option>
            <option value="reversed">ملغية/معكوسة</option>
          </select>
          <div className="flex gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded-md text-sm" title="من تاريخ" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2 py-2 bg-input border border-border rounded-md text-sm" title="إلى تاريخ" />
          </div>
        </div>
      </div>

      {/* 4. بطاقات الملخص (Summaries based on filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex flex-col justify-center">
          <p className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">الرصيد الفعلي الحالي</p>
          <p className="text-2xl font-bold text-primary font-mono" dir="ltr">{formatCurrency(cashbox.balance)}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-xl">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
            <ArrowDownToLine className="h-3.5 w-3.5" /> إجمالي الداخل (بعد الفلترة)
          </p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono" dir="ltr">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-4 rounded-xl">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1">
            <ArrowUpFromLine className="h-3.5 w-3.5" /> إجمالي الخارج (بعد الفلترة)
          </p>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-400 font-mono" dir="ltr">{formatCurrency(totalOut)}</p>
        </div>
        <div className="bg-secondary/30 border border-border p-4 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground mb-1">عدد الحركات (في الجدول)</p>
          <p className="text-xl font-bold text-foreground font-mono" dir="ltr">{filteredTransactions.length} حركة</p>
        </div>
      </div>

      {/* 5. كشف الحساب (Ledger Table) */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h2 className="font-bold text-foreground">الحركات المالية</h2>
          {txLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-secondary/50 text-secondary-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">التاريخ</th>
                <th className="px-4 py-3 font-semibold">الحركة / التفاصيل</th>
                <th className="px-4 py-3 font-semibold text-left">المبلغ</th>
                <th className="px-4 py-3 font-semibold text-left">الرصيد بعد</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
                <th className="px-4 py-3 font-semibold w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.map((tx) => {
                const isReversed = tx.status === 'reversed';
                
                // تحديد عنوان التفاصيل (خصوصاً للتحويلات)
                let detailTitle = tx.description;
                if (tx.type === 'transfer_out' && tx.counterpartCashboxName) detailTitle = `إلى خزينة: ${tx.counterpartCashboxName}`;
                if (tx.type === 'transfer_in' && tx.counterpartCashboxName) detailTitle = `من خزينة: ${tx.counterpartCashboxName}`;

                return (
                  <tr key={tx.id} className={`hover:bg-secondary/10 transition-colors ${isReversed ? 'opacity-60 bg-secondary/20' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs" dir="ltr">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`w-fit inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          tx.flow === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {txTypeLabels[tx.type]}
                        </span>
                        <span className={`font-medium max-w-[200px] sm:max-w-xs truncate ${isReversed ? 'line-through text-muted-foreground' : ''}`} title={tx.description}>
                          {detailTitle}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-left" dir="ltr">
                      <span className={tx.flow === 'in' ? 'text-emerald-600' : 'text-rose-600'}>
                        {tx.flow === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-muted-foreground text-left" dir="ltr">
                      {formatCurrency(tx.balanceAfter)}
                    </td>
                    <td className="px-4 py-3">
                      {tx.status === 'active' ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> معتمدة</span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive text-xs font-bold"><XCircle className="h-3.5 w-3.5" /> ملغية</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* زر التفاصيل (يعمل دائماً) */}
                        <button onClick={() => { setSelectedTx(tx); setModalType('details'); }} className="text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 p-1.5 rounded transition-colors" title="عرض التفاصيل">
                          <Eye className="h-4 w-4" />
                        </button>
                        
                        {/* أزرار الإلغاء (تعمل للحركات الفعالة فقط) */}
                        {tx.status === 'active' && (
                          <>
                            {/* إلغاء حركة يدوية (إيداع/سحب) */}
                            {['deposit', 'withdraw'].includes(tx.type) && (
                              <button onClick={() => { setSelectedTx(tx); setModalType('reverse_manual'); }} className="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-1.5 rounded transition-colors" title="إلغاء/تصحيح الحركة">
                                <Undo2 className="h-4 w-4" />
                              </button>
                            )}
                            
                            {/* إلغاء تحويل (التحويل العكسي المزدوج) */}
                            {['transfer_in', 'transfer_out'].includes(tx.type) && tx.transferId && (
                              <button onClick={() => { setSelectedTx(tx); setModalType('reverse_transfer'); }} className="text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 p-1.5 rounded transition-colors" title="تحويل عكسي (إلغاء التحويل بالكامل)">
                                <ArrowRightLeft className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && !txLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد حركات مطابقة للفلاتر المحددة.
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
      
      {/* 1. نافذة الإيداع / السحب */}
      {(modalType === 'deposit' || modalType === 'withdraw') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className={`px-6 py-4 border-b border-border text-white ${modalType === 'deposit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h2 className="text-lg font-bold">{modalType === 'deposit' ? 'إيداع نقدي' : 'سحب نقدي'}</h2>
            </div>
            <form onSubmit={handleManualSubmit(onManualSubmit)} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ج.م) <span className="text-destructive">*</span></label>
                <input type="number" step="0.01" {...registerManual("amount")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono" placeholder="0.00" />
                {manualErrors.amount && <p className="text-destructive text-xs">{manualErrors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">البيان / الوصف <span className="text-destructive">*</span></label>
                <textarea {...registerManual("description")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="اكتب سبب الحركة بوضوح..." rows={3} />
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

      {/* 2. نافذة التحويل لخزينة أخرى */}
      {modalType === 'transfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-blue-600 text-white">
              <h2 className="text-lg font-bold">تحويل لخزينة أخرى</h2>
            </div>
            <form onSubmit={handleTransferSubmit(onTransferSubmit)} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">إلى خزينة / حساب <span className="text-destructive">*</span></label>
                <select {...registerTransfer("destinationId")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary">
                  <option value="">اختر الخزينة المستقبلة...</option>
                  {cashboxes.filter(c => c.id !== id && c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {transferErrors.destinationId && <p className="text-destructive text-xs">{transferErrors.destinationId.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">مبلغ التحويل (ج.م) <span className="text-destructive">*</span></label>
                <input type="number" step="0.01" {...registerTransfer("amount")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono" placeholder="0.00" />
                {transferErrors.amount && <p className="text-destructive text-xs">{transferErrors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">البيان (اختياري)</label>
                <input type="text" {...registerTransfer("description")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder={`تحويل من ${cashbox.name}...`} />
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

      {/* 3. نافذة إلغاء حركة يدوية / أو تحويل عكسي */}
      {(modalType === 'reverse_manual' || modalType === 'reverse_transfer') && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className={`px-6 py-4 border-b border-border text-white ${modalType === 'reverse_transfer' ? 'bg-orange-600' : 'bg-amber-600'}`}>
              <h2 className="text-lg font-bold flex items-center gap-2">
                {modalType === 'reverse_transfer' ? <ArrowRightLeft className="h-5 w-5"/> : <Undo2 className="h-5 w-5"/>} 
                {modalType === 'reverse_transfer' ? 'تحويل عكسي (إلغاء التحويل)' : 'إلغاء وتصحيح الحركة'}
              </h2>
            </div>
            <form onSubmit={handleReverseSubmit(onReverseSubmit)} className="p-6 space-y-4">
              <div className={`p-3 border rounded-md text-sm ${modalType === 'reverse_transfer' ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <p>
                  {modalType === 'reverse_transfer' 
                    ? `سيتم إنشاء تحويل عكسي لسحب المبلغ (${formatCurrency(selectedTx.amount)}) وإعادته، وسيتم إبطال التحويل الأصلي في الخزنتين لضمان سلامة الحسابات.` 
                    : `لن يتم حذف الحركة. سيتم إنشاء حركة تصحيحية لضبط الرصيد، وتغيير حالة هذه الحركة إلى "ملغية".`}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">سبب الإلغاء <span className="text-destructive">*</span></label>
                <textarea {...registerReverse("reason")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="مثال: تم إدخال المبلغ بالخطأ..." rows={2} />
                {reverseErrors.reason && <p className="text-destructive text-xs">{reverseErrors.reason.message}</p>}
              </div>
              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={closeModals} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">تراجع</button>
                <button type="submit" disabled={isSubmitting} className={`flex-1 text-white py-2 rounded-md font-medium flex justify-center items-center gap-2 ${modalType === 'reverse_transfer' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تأكيد الإلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. نافذة تفاصيل الحركة (View Details) */}
      {modalType === 'details' && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-lg rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-secondary/50 flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2"><Info className="h-5 w-5 text-primary"/> تفاصيل الحركة</h2>
              {selectedTx.status === 'active' ? (
                <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">معتمدة</span>
              ) : (
                <span className="bg-destructive/10 text-destructive px-2 py-1 rounded text-xs font-bold">ملغية / معكوسة</span>
              )}
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><Calendar className="h-3 w-3"/> التاريخ والوقت</p>
                  <p className="font-semibold" dir="ltr">{formatDate(selectedTx.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><Hash className="h-3 w-3"/> نوع الحركة</p>
                  <p className="font-semibold">{txTypeLabels[selectedTx.type]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">المبلغ</p>
                  <p className={`font-mono font-bold text-lg ${selectedTx.flow === 'in' ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">
                    {selectedTx.flow === 'in' ? '+' : '-'}{formatCurrency(selectedTx.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">الرصيد بعد الحركة</p>
                  <p className="font-mono font-bold text-lg text-foreground" dir="ltr">
                    {formatCurrency(selectedTx.balanceAfter)}
                  </p>
                </div>
              </div>
              
              <div className="border-t border-border pt-4">
                <p className="text-muted-foreground text-xs mb-1">البيان / الوصف</p>
                <p className="font-medium bg-secondary/30 p-2 rounded border border-border/50">{selectedTx.description}</p>
              </div>

              {selectedTx.counterpartCashboxName && (
                <div className="border-t border-border pt-4">
                  <p className="text-muted-foreground text-xs mb-1">الخزينة المقابلة (الطرف الآخر)</p>
                  <p className="font-medium">{selectedTx.counterpartCashboxName}</p>
                </div>
              )}

              <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><User className="h-3 w-3"/> بواسطة المستخدم</p>
                  <p className="font-semibold text-xs truncate" title={selectedTx.createdBy}>{selectedTx.createdBy}</p>
                </div>
                {selectedTx.transferId && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><Hash className="h-3 w-3"/> رقم التحويل المرجعي</p>
                    <p className="font-mono text-xs">{selectedTx.transferId}</p>
                  </div>
                )}
                {selectedTx.referenceType === 'correction' && selectedTx.referenceId && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-1 text-amber-600 font-semibold">تعكس الحركة رقم:</p>
                    <p className="font-mono text-xs">{selectedTx.referenceId}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border bg-secondary/30 text-left">
              <button onClick={closeModals} className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-6 py-2 rounded-md font-medium">إغلاق</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
