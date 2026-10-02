// ==========================================
// Phase 1 & 2 Types (Master Data, Cashbox, Inventory)
// ==========================================

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'cashier' | 'manager';
  displayName?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  sku?: string;
  barcode?: string;
  price1: number;
  price2: number;
  price3: number;
  price4: number;
  lastPurchaseCost?: number; // UI Cache only: Used for fast autocomplete, NOT an accounting/WAC value
  reorderLevel: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cashbox {
  id: string;
  name: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionType = 'in' | 'out';

// Financial References (Cashbox, Supplier Ledger, Customer Ledger)
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
  description: string;
  createdBy: string;
  createdAt: Date;
}

// Inventory References (Stock Movements)
export type InventoryReferenceType = 
  | 'manual'
  | 'opening_balance'
  | 'purchase_invoice' 
  | 'purchase_return' 
  | 'sales_invoice'
  | 'sales_return' 
  | 'transfer' 
  | 'adjustment' 
  | 'damage';

export type InventoryMovementType = 
  | 'opening_balance'
  | 'purchase' 
  | 'purchase_return' 
  | 'sale' 
  | 'sale_return' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'adjustment_in' 
  | 'adjustment_out' 
  | 'damage';

export type MovementFlow = 'in' | 'out';

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
  flow: MovementFlow;
  quantityIn: number;
  quantityOut: number;
  balanceAfter: number;
  unitCost: number; // For WAC or Historical Cost
  averageCostAfter: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  sourceLineId?: string; // For accurate Idempotency
  transferId?: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Phase 3 Types (Inbound & Payables)
// ==========================================

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  alternatePhone?: string;
  address?: string;
  notes?: string;
  currentBalance: number; // Cache only, Source of truth is SupplierLedger
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierLedger {
  id: string;
  supplierId: string;
  referenceType: FinancialReferenceType;
  referenceId: string;
  credit: number; // (+) Increases our debt to supplier (e.g., Purchase Invoice)
  debit: number;  // (+) Decreases our debt to supplier (e.g., Payment or Return)
  balanceAfter: number; // previousBalance + credit - debit
  description: string;
  createdAt: Date;
  createdBy: string;
}

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid';

export interface PurchaseInvoice {
  id: string;
  // Core Identifiers
  invoiceNumber: string; // Commercial invoice number from the supplier
  invoiceDate: Date; // The actual date written on the supplier's invoice
  
  // Relations
  supplierId: string;
  warehouseId: string;
  cashboxId?: string; // If a payment was made immediately
  
  // Historical Snapshots
  supplierName: string;
  supplierPhone: string;
  warehouseName: string;

  // Totals
  subtotal: number;
  discount: number; // Global discount applied to the invoice
  additionalFees: number; // Acquisition-related fees (freight, customs) -> prorated into WAC
  netAmount: number; // subtotal - discount + additionalFees
  paidAmount: number;
  remainingAmount: number; // netAmount - paidAmount (goes to SupplierLedger as credit)
  
  // Metadata
  status: InvoiceStatus;
  notes?: string;
  createdAt: Date; // System entry timestamp
  createdBy: string;
}

export interface PurchaseInvoiceLine {
  id: string;
  invoiceId: string;
  productId: string;
  
  // Historical Snapshot (to prevent changing old invoices if master data changes)
  productName: string;
  categoryName: string;
  sku?: string;
  barcode?: string;
  
  // Line Quantities & Input Prices
  quantity: number;
  unitPrice: number; // Raw cost entered by user
  
  // Prorating Breakdown (Auditable Trail)
  grossLineTotal: number; // quantity * unitPrice
  allocatedDiscount: number; // The line's prorated share of the global invoice discount
  allocatedFees: number; // The line's prorated share of the global additional fees
  netLineTotal: number; // grossLineTotal - allocatedDiscount + allocatedFees
  
  // The crucial WAC parameter
  netUnitCost: number; // netLineTotal / quantity (This is the historical cost sent to Inventory Engine)
  
  // Snapshot of Sale Prices at the time of purchase
  salePrice1: number;
  salePrice2: number;
  salePrice3: number;
  salePrice4: number;
}
