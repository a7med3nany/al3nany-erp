import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowRight, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, 
  Wallet, Search, Filter, AlertCircle, Loader2, RotateCcw,
  PlusCircle, MinusCircle, FileText, CheckCircle2
} from 'lucide-react';
import { useCashboxStore } from '../../store/cashboxStore';
import { useTransactionStore } from '../../store/transactionStore';
import { CashboxTransaction } from '../../types';

export default function CashboxDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { cashboxes, fetchCashboxes } = useCashboxStore();
  const { 
    transactions, 
    isLoading: isTxLoading, 
    error: txError, 
    fetchLedger, 
    executeManualTransaction, 
    executeTransfer,
    reverseTx,
    reverseTransfer
  } = useTransactionStore();

  const cashbox = cashboxes.find(c => c.id === id);

  // States for Modals
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualType, setManualType] = useState<'in' | 'out'>('in');
  
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [txToReverse, setTxToReverse] = useState<CashboxTransaction | null>(null);

  // Form States
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [destCashboxId, setDestCashboxId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  useEffect(() => {
    if (id) {
      fetchCashboxes();
      fetchLedger(id);
    }
  }, [id, fetchCashboxes, fetchLedger]);

  // مسح رسالة النجاح تلقائياً بعد 4 ثوانٍ
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.referenceId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType ? tx.type === filterType : true;
      return matchSearch && matchType;
    });
  }, [transactions, searchTerm, filterType]);

  // فحص ما إذا كانت الحركة قد تم عكسها بالفعل (بالبحث عن حركتها العكسية في نفس السجل)
  const isTxReversed = (tx: CashboxTransaction) => {
    return transactions.some(t => t.referenceId === `rev_${tx.referenceId}`);
  };

  const resetForms = () => {
    setAmount('');
    setDescription('');
    setDestCashboxId('');
    setActionError(null);
  };

  const handleOpenManual = (type: 'in' | 'out') => {
    resetForms();
    setManualType(type);
    setIsManualModalOpen(true);
  };

  const handleOpenTransfer = () => {
    resetForms();
    setIsTransferModalOpen(true);
  };

  const handleOpenReverse = (tx: CashboxTransaction) => {
    setActionError(null);
    setTxToReverse(tx);
    setIsReverseModalOpen(true);
  };

  const submitManualTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await executeManualTransaction({
        cashboxId: id,
        type: manualType,
        amount: Number(amount),
        description: description,
        createdBy: 'admin'
      });
      fetchCashboxes();
      setIsManualModalOpen(false);
      setSuccessMessage(manualType === 'in' ? 'تم الإيداع بنجاح.' : 'تم السحب بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء تنفيذ العملية');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await executeTransfer({
        sourceCashboxId: id,
        destCashboxId: destCashboxId,
        amount: Number(amount),
        description: description,
        createdBy: 'admin'
      });
      fetchCashboxes();
      setIsTransferModalOpen(false);
      setSuccessMessage('تم التحويل المالي بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء التحويل');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReverse = async () => {
    if (!id || !txToReverse) return;
    setIsSubmitting(true);
    setActionError(null);
    
    try {
      if (txToReverse.referenceType === 'transfer') {
        // بما أن الـ CashboxTransaction لا يحمل صراحة الـ counterpart ID 
        // وممنوع عمل استعلام خارجي هنا، فلا يمكننا تحديد الطرف الآخر بأمان לעكس التحويل الذري.
        throw new Error('تعذر تحديد الخزينة المقابلة لهذا التحويل للقيام بعملية العكس بأمان.');
        
        /* 
         * الكود الصحيح إذا توفرت بيانات الطرف الآخر سيكون:
         * await reverseTransfer(txToReverse.referenceId, sourceId, destId, 'admin');
         */
      } else {
        // إلغاء معاملة يدوية عادية
        await reverseTx(txToReverse.id, 'admin');
      }

      await fetchLedger(id);
      fetchCashboxes();
      setIsReverseModalOpen(false);
      setSuccessMessage('تم عكس الحركة بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء الإلغاء');
    } finally {
      setIsSubmitting(false);
    }
  };

  const translateRefType = (refType: string) => {
    const map: Record<string, string> = {
      'manual': 'حركة يدوية',
      'transfer': 'تحويل مالي',
      'opening_balance': 'رصيد افتتاحي',
      'purchase_invoice': 'فاتورة مشتريات',
      'purchase_return': 'مرتجع مشتريات',
      'supplier_payment': 'سداد مورد',
      'sales_invoice': 'فاتورة مبيعات',
      'sales_return': 'مرتجع مبيعات',
      'customer_receipt': 'مقبوضات عميل',
      'expense': 'مصروفات'
    };
    return map[refType] || refType;
  };

  if (!cashbox && !isTxLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground bg-card rounded-xl border border-border shadow-sm">
        <AlertCircle className="h-12 w-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-foreground">الخزينة غير موجودة</h2>
        <Link to="/cashboxes" className="mt-4 text-primary hover:underline">العودة لقائمة الخزائن</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Header & Balance */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link to="/cashboxes" className="p-2 bg-secondary/50 text-secondary-foreground rounded-full hover:bg-secondary transition-colors" title="العودة">
              <ArrowRight className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                <Wallet className="h-6 w-6" /> {cashbox?.name || 'جاري التحميل...'}
              </h1>
              <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1">
                <FileText className="h-4 w-4" /> كشف حساب وسجل حركات الخزينة
              </p>
            </div>
          </div>
          <div className="bg-primary/10 border border-primary/20 px-6 py-3 rounded-lg text-center md:text-left min-w-[200px]">
            <p className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">الرصيد الفعلي الحالي</p>
            <p className="text-3xl font-black text-primary">
              {Number(cashbox?.balance || 0).toLocaleString()} <span className="text-lg text-primary/70">{cashbox?.currency || 'ج.م'}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-border">
          <button 
            onClick={() => handleOpenManual('in')} 
            disabled={isSubmitting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-md font-medium transition-colors shadow-sm disabled:opacity-70"
          >
            <PlusCircle className="h-5 w-5" /> إيداع نقدي
          </button>
          <button 
            onClick={() => handleOpenManual('out')} 
            disabled={isSubmitting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-md font-medium transition-colors shadow-sm disabled:opacity-70"
          >
            <MinusCircle className="h-5 w-5" /> سحب نقدي
          </button>
          <button 
            onClick={handleOpenTransfer} 
            disabled={isSubmitting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md font-medium transition-colors shadow-sm disabled:opacity-70"
          >
            <ArrowLeftRight className="h-5 w-5" /> تحويل لخزينة أخرى
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 p-4 rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="font-bold">{successMessage}</p>
        </div>
      )}

      {txError && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{txError}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter className="h-5 w-5" /> فلاتر البحث في السجل
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="بحث بالوصف أو رقم المستند..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-3 pr-9 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" 
            />
          </div>
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value)} 
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          >
            <option value="">كل أنواع الحركات</option>
            <option value="in">الوارد (إيداعات)</option>
            <option value="out">الصادر (سحوبات)</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isTxLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل كشف الحساب...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-4 font-semibold">التاريخ</th>
                  <th className="px-4 py-4 font-semibold">الحركة / التفاصيل</th>
                  <th className="px-4 py-4 font-semibold text-center">المبلغ</th>
                  <th className="px-4 py-4 font-semibold text-center">الرصيد بعد</th>
                  <th className="px-4 py-4 font-semibold text-center w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTransactions.map((tx) => {
                  const reversed = isTxReversed(tx);
                  const isReverseAction = tx.referenceId.startsWith('rev_');

                  return (
                    <tr key={tx.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground">
                        <div className="font-medium text-foreground">{tx.createdAt?.toLocaleDateString('en-GB')}</div>
                        <div className="text-xs">{tx.createdAt?.toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' })}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2 mb-1">
                          {tx.type === 'in' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-bold border border-emerald-200">
                              <ArrowDownLeft className="h-3 w-3" /> وارد
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-xs font-bold border border-rose-200">
                              <ArrowUpRight className="h-3 w-3" /> صادر
                            </span>
                          )}
                          <span className="text-xs bg-secondary px-2 py-0.5 rounded font-medium text-secondary-foreground border border-border">
                            {tx.referenceType === 'transfer' 
                              ? (tx.type === 'in' ? 'تحويل وارد' : 'تحويل صادر') 
                              : translateRefType(tx.referenceType)}
                          </span>
                        </div>
                        <div className="text-foreground font-medium">{tx.description || '-'}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono text-left block w-fit" dir="ltr">#{tx.referenceId}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-center">
                        <span className={`font-bold ${tx.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'in' ? '+' : '-'}{Number(tx.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-center font-bold text-foreground">
                        {Number(tx.balanceAfter).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top text-center">
                        {isReverseAction ? (
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">حركة عكس</span>
                        ) : reversed ? (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-200">تم عكس التحويل</span>
                        ) : (
                          <button 
                            onClick={() => handleOpenReverse(tx)}
                            disabled={isSubmitting}
                            className="text-xs text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 p-1.5 rounded transition-colors w-full flex items-center justify-center gap-1 border border-rose-200 hover:border-transparent disabled:opacity-50"
                            title={tx.referenceType === 'transfer' ? 'عكس التحويل المالي' : 'إلغاء الحركة اليدوية'}
                          >
                            <RotateCcw className="h-3 w-3" /> {tx.referenceType === 'transfer' ? 'عكس التحويل' : 'إلغاء الحركة'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      لا توجد حركات مطابقة في سجل الخزينة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Transaction Modal (In/Out) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className={`flex items-center justify-between px-6 py-4 border-b border-border ${manualType === 'in' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
              <h2 className="text-lg font-bold flex items-center gap-2">
                {manualType === 'in' ? <><PlusCircle className="h-5 w-5" /> إيداع نقدي</> : <><MinusCircle className="h-5 w-5" /> سحب نقدي</>}
              </h2>
              <button onClick={() => setIsManualModalOpen(false)} className="opacity-70 hover:opacity-100 transition-opacity p-1 text-xl leading-none">&times;</button>
            </div>
            
            <div className="p-6">
              <form id="manualForm" onSubmit={submitManualTransaction} className="space-y-4">
                {actionError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{actionError}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">المبلغ ({cashbox?.currency}) <span className="text-destructive">*</span></label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0.01" 
                    required
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-bold text-lg" 
                    placeholder="0.00" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">البيان / الوصف</label>
                  <input 
                    type="text" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" 
                    placeholder="مثال: إيداع مبيعات اليوم / سداد مصروفات نثريات..." 
                  />
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex gap-3">
              <button type="button" onClick={() => setIsManualModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
              <button 
                form="manualForm" 
                type="submit" 
                disabled={isSubmitting || !amount} 
                className={`flex-1 text-white py-2 rounded-md font-medium flex items-center justify-center gap-2 ${manualType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'} disabled:opacity-50`}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد العملية'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-blue-50 text-blue-900">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" /> تحويل لخزينة أخرى
              </h2>
              <button onClick={() => setIsTransferModalOpen(false)} className="opacity-70 hover:opacity-100 transition-opacity p-1 text-xl leading-none">&times;</button>
            </div>
            
            <div className="p-6">
              <form id="transferForm" onSubmit={submitTransfer} className="space-y-4">
                {actionError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{actionError}</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">تحويل إلى <span className="text-destructive">*</span></label>
                  <select 
                    required
                    value={destCashboxId} 
                    onChange={e => setDestCashboxId(e.target.value)} 
                    className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm font-medium"
                  >
                    <option value="">-- اختر الخزينة المستقبلة --</option>
                    {cashboxes.filter(c => c.id !== id && c.isActive).map(c => (
                      <option key={c.id} value={c.id}>{c.name} (الرصيد: {c.balance})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">المبلغ ({cashbox?.currency}) <span className="text-destructive">*</span></label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0.01" 
                    required
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-bold text-lg" 
                    placeholder="0.00" 
                  />
                  <p className="text-xs text-muted-foreground">أقصى مبلغ متاح للتحويل: {cashbox?.balance}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">البيان / الوصف</label>
                  <input 
                    type="text" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" 
                    placeholder="مثال: عهدة مؤقتة / تحويل أرباح..." 
                  />
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex gap-3">
              <button type="button" onClick={() => setIsTransferModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
              <button 
                form="transferForm" 
                type="submit" 
                disabled={isSubmitting || !amount || !destCashboxId} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد التحويل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Transaction / Transfer Modal */}
      {isReverseModalOpen && txToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="h-8 w-8" />
              </div>
              
              <h2 className="text-xl font-bold text-foreground">
                {txToReverse.referenceType === 'transfer' ? 'تأكيد عكس التحويل المالي' : 'تأكيد إلغاء الحركة'}
              </h2>
              
              <div className="text-sm text-muted-foreground p-3 bg-secondary/50 rounded-lg text-right">
                <p><strong>المبلغ:</strong> {Number(txToReverse.amount).toLocaleString()}</p>
                <p><strong>البيان:</strong> {txToReverse.description || 'بدون بيان'}</p>
              </div>

              {txToReverse.referenceType === 'transfer' ? (
                <div className="text-xs text-right bg-rose-50 text-rose-800 p-3 rounded-lg border border-rose-200 space-y-1">
                  <p className="font-bold">سيتم تنفيذ الإجراءات الذرية التالية:</p>
                  <ul className="list-disc list-inside">
                    <li>إعادة المبلغ إلى الخزينة المصدر</li>
                    <li>خصم المبلغ من الخزينة المستقبلة</li>
                    <li>تسجيل عملية عكس كاملة في السجل</li>
                  </ul>
                  <p className="mt-2 text-rose-600 font-bold">هذا الإجراء لا يمكن التراجع عنه إلا بعملية مالية جديدة.</p>
                </div>
              ) : (
                <p className="text-xs text-rose-600 font-bold">
                  تنبيه: سيتم تسجيل حركة عكسية جديدة في السجل لتسوية الرصيد ولن يتم مسح الحركة القديمة للحفاظ على التسلسل المحاسبي.
                </p>
              )}
              
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-xs font-semibold mt-4 text-right flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{actionError}</p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4 mt-2">
                <button type="button" onClick={() => setIsReverseModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">تراجع</button>
                <button 
                  type="button" 
                  onClick={submitReverse} 
                  disabled={isSubmitting} 
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-md font-medium flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد الإلغاء'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
