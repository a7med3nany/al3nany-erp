// ==========================================
// User & Auth Types
// ==========================================
export interface User {
  id: string;
  name: string;
  email: string;
  role_id?: string;
  status?: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

// ==========================================
// Master Data Types
// ==========================================
export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CashboxType = 'cash' | 'bank' | 'wallet' | 'digital';

export interface Cashbox {
  id: string;
  name: string;
  type: CashboxType;
  isMain: boolean;
  isDaily: boolean;
  isActive: boolean;
  balance: number;
  description?: string;
  currency?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductGroup {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  sku?: string;
  barcode?: string;
  price1: number;
  price2?: number;
  price3?: number;
  price4?: number;
  reorderLevel: number;
  isActive: boolean;
  isDeleted?: boolean;
  lastPurchaseCost?: number;
  averageCost?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Financial & Ledger Types
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

export interface CashboxTransaction {
  id: string;
  cashboxId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  counterpartCashboxId?: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
}

// ==========================================
// Supplier Types
// ==========================================
export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  balance: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  referenceType: FinancialReferenceType;
  referenceId: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
}

// ==========================================
// Inventory Types
// ==========================================
export type InventoryMovementType = 
  | 'stock_in' 
  | 'stock_out' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'purchase_return' 
  | 'sales_return';

export type InventoryReferenceType = 
  | 'manual' 
  | 'purchase_invoice' 
  | 'purchase_return' 
  | 'sales_invoice' 
  | 'sales_return' 
  | 'transfer';

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
  description?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Inventory Source Layers (New Architecture)
// ==========================================
export interface InventoryLayer {
  layerId: string;
  supplierId: string;
  purchaseInvoiceId: string;
  purchaseLineId: string;
  unitCost: number;
  originalQuantity: number;
  remainingQuantity: number;
  createdAt: Date;
  isLegacy?: boolean;
  parentLayerId?: string;
}

export interface InventoryLayerTracker {
  id: string;
  warehouseId: string;
  productId: string;
  activeLayers: InventoryLayer[];
  updatedAt: Date;
}

// ==========================================
// Purchase Invoice Types
// ==========================================
export interface PurchaseInvoiceItem {
  lineId: string;
  productId: string;
  quantity: number;
  purchasePrice: number;
  grossLineTotal: number;
  allocatedDiscount: number;
  allocatedAcquisitionCharges: number;
  netUnitCost: number;
  totalCost: number;
  returnedQuantity?: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseInvoiceItem[];
  subtotal: number;
  discount: number;
  additionalCharges: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash' | 'credit' | 'partial';
  cashboxId?: string;
  status: 'completed' | 'partially_returned' | 'fully_returned' | 'cancelled';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Purchase Return Types
// ==========================================
export interface PurchaseReturnItem {
  lineId: string;
  originalLineId?: string;
  productId: string;
  quantity: number;
  returnPrice: number;
  totalAmount: number;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  originalPurchaseInvoiceId?: string;
  supplierId: string;
  warehouseId: string;
  items: PurchaseReturnItem[];
  totalAmount: number;
  refundedAmount: number;
  supplierCreditAmount: number;
  cashboxId?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
