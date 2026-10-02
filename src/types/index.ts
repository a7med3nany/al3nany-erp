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
export type TransactionFlow = 'in' | 'out';

export type TransactionType = 
  | 'deposit'           
  | 'withdraw'          
  | 'transfer_in'       
  | 'transfer_out'      
  | 'customer_receipt'  
  | 'supplier_payment'  
  | 'expense'           
  | 'sales_return'      
  | 'purchase_return'   
  | 'reverse';          

// تحديث ReferenceType ليشمل الحركات المخزنية أيضاً
export type ReferenceType = 
  | 'manual'            
  | 'transfer'          
  | 'sale_invoice'      
  | 'purchase_invoice'  
  | 'customer_receipt'  
  | 'supplier_payment'  
  | 'expense'           
  | 'sales_return'      
  | 'purchase_return'   
  | 'correction'
  | 'opening_stock'     // رصيد افتتاحي
  | 'adjustment'        // تسوية/جرد
  | 'damage';           // هالك

export type TransactionStatus = 
  | 'active'            
  | 'reversed';         

export interface FinancialTransaction extends BaseEntity {
  cashboxId: string;             
  type: TransactionType;         
  flow: TransactionFlow;         
  amount: number;                
  balanceAfter: number;          
  referenceType: ReferenceType;  
  referenceId?: string;          
  transferId?: string;           
  counterpartCashboxId?: string; 
  counterpartCashboxName?: string; 
  description: string;           
  status: TransactionStatus;     
  reversedByTransactionId?: string; 
  createdBy: string;             
}


// ----------------------------------------------------------------------
// 4. البيانات الأساسية للأصناف (Master Data: Categories & Products)
// ----------------------------------------------------------------------
export interface Category extends BaseEntity {
  name: string;
  description?: string;
  isActive: boolean;
  isDeleted: boolean; // Soft delete لمنع كسر المنتجات المرتبطة
}

export interface Product extends BaseEntity {
  categoryId: string;
  name: string;
  sku?: string;           // كود داخلي
  barcode?: string;       // باركود دولي أو محلي
  price1: number;         // سعر البيع 1 (قطاعي مثلاً)
  price2: number;         // سعر البيع 2 (جملة)
  price3: number;         // سعر البيع 3 (نصف جملة)
  price4: number;         // سعر البيع 4 (خاص)
  reorderLevel: number;   // حد إعادة الطلب
  isActive: boolean;
  isDeleted: boolean;     // Soft delete لمنع كسر الفواتير التاريخية
  // ملاحظة: لا يوجد أي حقول للكمية (stock) أو التكلفة (cost) هنا.
}


// ----------------------------------------------------------------------
// 5. المخزون وحركاته (Inventory & Movements Ledger)
// ----------------------------------------------------------------------

// 5.1 حالة المخزون المخبأة (Cached State)
export interface InventoryItem {
  id: string;             // Composite ID (e.g., warehouseId_productId)
  productId: string;
  warehouseId: string;
  quantity: number;       // الكمية الحالية (للعرض فقط)
  wac: number;            // متوسط التكلفة المرجح (يُحفظ بدقة 4 منازل عشرية)
  inventoryValue: number; // إجمالي قيمة المخزون (quantity * wac)
  lastUpdatedAt: Date;    // تاريخ آخر حركة أثرت على الرصيد أو التكلفة
}

// 5.2 أنواع واتجاهات حركة المخزون
export type InventoryMovementType = 
  | 'opening_stock'
  | 'purchase'
  | 'sale'
  | 'purchase_return'
  | 'sales_return'
  | 'transfer_in'
  | 'transfer_out'
  | 'damage'
  | 'adjustment';

export type MovementFlow = 'in' | 'out';

// 5.3 دفتر أستاذ المخزون (Source of Truth)
export interface InventoryMovement extends BaseEntity {
  productId: string;
  warehouseId: string;
  type: InventoryMovementType;
  flow: MovementFlow;
  
  quantityIn: number;
  quantityOut: number;
  balanceAfter: number;       // رصيد الصنف في هذا المخزن بعد الحركة
  
  unitCost: number;           // التكلفة التاريخية الثابتة لهذه الحركة (للمشتريات هو سعر الشراء، للمبيعات هو الـ WAC وقت البيع)
  averageCostAfter: number;   // متوسط التكلفة (WAC) المحسوب بعد هذه الحركة للتدقيق
  
  referenceType: ReferenceType;
  referenceId: string;        // ID الفاتورة أو الإذن
  transferId?: string;        // ID التحويل المشترك بين مخزنين
  
  description?: string;
  createdBy: string;
}


// ----------------------------------------------------------------------
// 6. المبيعات والأرباح (Sales Invoices Data Model Base)
// تم إضافتها لتثبيت قواعد حساب الربحية بدقة
// ----------------------------------------------------------------------
export interface SalesInvoiceItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;      // سعر البيع للوحدة
  totalPrice: number;     // quantity * unitPrice (قبل الخصم)
  discount: number;       // نصيب هذا السطر من الخصم (أو خصم خاص به)
  netTotal: number;       // totalPrice - discount
  
  cogs: number;           // (Historical WAC وقت البيع) * quantity
  grossProfit: number;    // netTotal - cogs
}

export interface SalesInvoice extends BaseEntity {
  customerId?: string;
  warehouseId: string;
  cashboxId?: string;     // الخزينة التي تم التوريد إليها (إن وجد دفع فوري)

  grossSales: number;     // إجمالي المبيعات (مجموع totalPrice للسطور)
  discount: number;       // إجمالي الخصومات
  additionalAmount: number; // رسوم إضافية (توصيل/خدمة)
  netSales: number;       // grossSales - discount + additionalAmount
  
  cogs: number;           // إجمالي تكلفة البضاعة المباعة (مجموع cogs للسطور)
  grossProfit: number;    // netSales - cogs (الربح التاريخي الثابت للفاتورة)

  paidAmount: number;     // ما تم دفعه
  remainingAmount: number;// المتبقي (آجل)

  createdBy: string;
}
