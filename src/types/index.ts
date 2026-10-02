// واجهة أساسية (Base Interface) تحتوي على الحقول المشتركة لكل كيانات النظام
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------
// 1. إدارة المخازن (Warehouses)
// ----------------------------------------------------------------------
export interface Warehouse extends BaseEntity {
  name: string;          
  location?: string;     
  isMain: boolean;       
  isActive: boolean;     
}


// ----------------------------------------------------------------------
// 2. إدارة الخزائن (Cashboxes / Treasuries)
// ----------------------------------------------------------------------

export type CashboxType = 'cash' | 'bank' | 'wallet' | 'digital';

export interface Cashbox extends BaseEntity {
  name: string;          
  type: CashboxType;     
  isMain: boolean;       
  isDaily: boolean;      
  isActive: boolean;     
  balance: number;       // [للعرض فقط - Cached Value] يتغير فقط من خلال حركة مالية مسجلة
  description?: string;  
}


// ----------------------------------------------------------------------
// 3. الحركات المالية للخزائن (Financial Transactions - Cash Ledger)
// ----------------------------------------------------------------------
// ملاحظة معمارية: هذا السجل هو Source of Truth للنقدية والخزائن فقط. 
// يمنع التعديل المباشر على أي حركة بعد إنشائها. التصحيح يتم فقط عبر إنشاء حركة عكسية (Reverse).

export type TransactionFlow = 'in' | 'out';

export type TransactionType = 
  | 'deposit'           // إيداع يدوي
  | 'withdraw'          // سحب يدوي
  | 'transfer_in'       // تحويل وارد (من خزينة أخرى)
  | 'transfer_out'      // تحويل صادر (إلى خزينة أخرى)
  | 'customer_receipt'  // قبض من عميل
  | 'supplier_payment'  // دفع لمورد
  | 'expense'           // مصروفات
  | 'sales_return'      // مرتجع مبيعات (خروج نقدية)
  | 'purchase_return'   // مرتجع مشتريات (دخول نقدية)
  | 'reverse';          // حركة عكسية (لتصحيح خطأ سابق سواء كان حركة فردية أو تحويل)

export type ReferenceType = 
  | 'manual'            // حركة يدوية
  | 'transfer'          // حركة تحويل
  | 'sale_invoice'      // فاتورة بيع
  | 'purchase_invoice'  // فاتورة شراء
  | 'customer_receipt'  // سند قبض
  | 'supplier_payment'  // سند صرف
  | 'expense'           // مستند مصروف
  | 'sales_return'      // فاتورة مرتجع بيع
  | 'purchase_return'   // فاتورة مرتجع شراء
  | 'correction';       // تسوية أو تصحيح

export type TransactionStatus = 
  | 'active'            // حركة سارية ومؤثرة على الرصيد (وتشمل الحركات العكسية reverse نفسها)
  | 'reversed';         // حركة تم عكس أثرها المالي وإبطالها بحركة تصحيحية (لا تدخل في إجماليات الداخل/الخارج)

export interface FinancialTransaction extends BaseEntity {
  cashboxId: string;             // معرف الخزينة التي تمت عليها الحركة
  type: TransactionType;         // نوع الحركة
  flow: TransactionFlow;         // دخول أو خروج
  amount: number;                // قيمة الحركة
  balanceAfter: number;          // الرصيد بعد الحركة (للعرض السريع في كشف الحساب - لا يُعدل يدوياً)
  
  referenceType: ReferenceType;  // نوع المستند الأصلي
  referenceId?: string;          // معرف المستند الأصلي (في الحركة العكسية 'reverse' يكون هو ID الحركة الأصلية التي تم عكسها)
  
  transferId?: string;           // معرف التحويل (يُربط به حركتي transfer_out و transfer_in، وأيضاً حركتي العكس الخاصة بهما)
  
  // حقول خاصة بالتحويلات (لتوثيق الخزينة المقابلة بدقة دون الاعتماد على الوصف)
  counterpartCashboxId?: string; // معرف الخزينة الطرف الآخر
  counterpartCashboxName?: string; // اسم الخزينة الطرف الآخر (وقت تنفيذ الحركة)
  
  description: string;           // البيان / الوصف (إجباري لتوثيق سبب الحركة)
  
  status: TransactionStatus;     // حالة الحركة (فعالة أو تم عكسها)
  reversedByTransactionId?: string; // في حال تم إلغاء الحركة، يُكتب هنا ID الحركة العكسية (للتدقيق Audit Trail)
  
  createdBy: string;             // معرف المستخدم الذي قام بالحركة (لتتبع المسؤولية)
}
