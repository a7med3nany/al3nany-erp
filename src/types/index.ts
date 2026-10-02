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
