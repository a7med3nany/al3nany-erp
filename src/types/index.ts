// ==========================================
// Core Enums & Shared Types
// ==========================================
export type TransactionType = 'in' | 'out';

export type FinancialReferenceType = 
  | 'manual' 
  | 'transfer' 
  | 'opening_balance' 
  | 'purchase_invoice' 
  | 'purchase_return' 
  | 'supplier_payment' 
  | 'sales_invoice' 
  | 'sales_return' 
  | 'customer_receipt' 
  | 'expense';

export type InventoryMovementType = 
  | 'stock_in' 
  | 'stock_out' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'purchase_return'
  | 'adjustment';

export type InventoryReferenceType = 
  | 'transfer' 
  | 'purchase_invoice' 
  | 'purchase_return' 
  | 'sales_invoice' 
  | 'sales_return' 
  | 'adjustment' 
  | 'manual';


// ==========================================
// Phase 1 & 2: Master Data, Cashbox, Inventory
// ==========================================

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  purchasePrice: number;
  lastPurchaseCost?: number;
  sellPrice1: number;
  sellPrice2?: number;
  sellPrice3?: number;
  sellPrice4?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  isMain?: boolean;
}

export interface Cashbox {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  isActive?: boolean;
  isMain?: boolean;
  isDaily?: boolean;
  updatedAt?: Date;
}

export interface CashboxTransaction {
  id: string;
  cashboxId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  counterpartCashboxId?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  wac: number;
  inventoryValue: number;
  lastUpdatedAt: Date;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: InventoryMovementType;
  flow: 'in' | 'out';
  quantityIn: number;
  quantityOut: number;
  balanceAfter: number;
  unitCost: number;
  averageCostAfter: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  transferId?: string;
  sourceLineId?: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}


// ==========================================
// Phase 3: Supplier & Procurement Management
// ==========================================

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  balance: number; // الرصيد: موجب (+) يعني التزام/مديونية علينا للمورد. سالب (-) يعني رصيد دائن لنا.
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: TransactionType; // 'in' = زيادة المديونية (فاتورة شراء), 'out' = تقليل المديونية (سداد/مرتجع)
  amount: number;
  balanceAfter: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  description: string;
  createdBy: string;
  createdAt: Date;
}

export type PurchaseInvoiceStatus = 'completed' | 'partially_returned' | 'fully_returned' | 'cancelled';

export interface PurchaseInvoiceItem {
  lineId: string;
  productId: string;
  quantity: number;
  purchasePrice: number;
  grossLineTotal: number;
  allocatedDiscount: number;
  allocatedAcquisitionCharges: number;
  netUnitCost: number; // التكلفة الصافية التاريخية الثابتة لهذا البند
  totalCost: number;
}

export interface PurchaseInvoice {
  id: string; // المعرف الداخلي للنظام
  invoiceNumber: string; // رقم الفاتورة المرجعي من المورد (غير فريد عالمياً)
  supplierId: string;
  warehouseId: string;
  items: PurchaseInvoiceItem[];
  
  // Financial Totals
  subtotal: number;
  discount: number;
  additionalCharges: number; // تكاليف الاقتناء (شحن، جمارك، الخ) التي توزع على تكلفة الأصناف
  totalAmount: number;
  
  // Payment Details
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash' | 'credit' | 'partial';
  cashboxId?: string; // مطلوب فقط إذا كان paidAmount > 0
  
  status: PurchaseInvoiceStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PurchaseReturnStatus = 'completed' | 'cancelled';

export interface PurchaseReturnItem {
  lineId: string;
  originalLineId: string; // يربط هذا السطر بالسطر الأصلي في فاتورة المشتريات
  productId: string;
  quantity: number;
  returnPrice: number; // يجب أن يعتمد على netUnitCost من الفاتورة الأصلية
  totalAmount: number;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  originalPurchaseInvoiceId: string; // معرف الفاتورة الأصلية المستقلة
  supplierId: string;
  warehouseId: string;
  items: PurchaseReturnItem[];
  
  // Financial Totals
  totalAmount: number;
  refundedAmount: number; // المبلغ المسترد نقداً
  supplierCreditAmount: number; // المبلغ الذي سيُخصم من مديونيتنا للمورد أو يصبح رصيدًا لنا عنده
  cashboxId?: string; // مطلوب فقط إذا كان refundedAmount > 0
  
  status: PurchaseReturnStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
