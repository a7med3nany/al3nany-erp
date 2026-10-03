import React from 'react';
import { usePurchaseStore } from '../../store/purchaseStore';
import { useSupplierStore } from '../../store/supplierStore';
import { useWarehouseStore } from '../../store/warehouseStore';

const PurchasesList: React.FC = () => {
  let purchaseStore: any = null;
  let purchaseError: string | null = null;

  let supplierStore: any = null;
  let supplierError: string | null = null;

  let warehouseStore: any = null;
  let warehouseError: string | null = null;

  // 1. Test Purchase Store
  try {
    purchaseStore = usePurchaseStore();
  } catch (error) {
    purchaseError = error instanceof Error ? error.message : String(error);
  }

  // 2. Test Supplier Store
  try {
    supplierStore = useSupplierStore();
  } catch (error) {
    supplierError = error instanceof Error ? error.message : String(error);
  }

  // 3. Test Warehouse Store
  try {
    warehouseStore = useWarehouseStore();
  } catch (error) {
    warehouseError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="container mx-auto p-6 dir-rtl" style={{ direction: 'rtl' }}>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">شاشة التشخيص 3 (Store Hooks Test)</h1>
      
      <div className="space-y-6">
        
        {/* Purchase Store Result */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <h2 className="text-lg font-bold text-blue-700 mb-3">Purchase Store</h2>
          {purchaseError ? (
            <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 font-mono text-left" style={{ direction: 'ltr' }}>
              Error: {purchaseError}
            </div>
          ) : (
            <div className="bg-white p-3 rounded border border-gray-200 font-mono text-sm space-y-2 text-left" style={{ direction: 'ltr' }}>
              <div><span className="font-bold text-gray-600">هل تم بنجاح؟</span> <span className="text-green-600 font-bold">Yes</span></div>
              <div><span className="text-gray-500">typeof purchaseStore:</span> {typeof purchaseStore}</div>
              <div><span className="text-gray-500">typeof purchaseStore.loadPurchaseInvoices:</span> {typeof purchaseStore?.loadPurchaseInvoices}</div>
            </div>
          )}
        </div>

        {/* Supplier Store Result */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <h2 className="text-lg font-bold text-blue-700 mb-3">Supplier Store</h2>
          {supplierError ? (
            <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 font-mono text-left" style={{ direction: 'ltr' }}>
              Error: {supplierError}
            </div>
          ) : (
            <div className="bg-white p-3 rounded border border-gray-200 font-mono text-sm space-y-2 text-left" style={{ direction: 'ltr' }}>
              <div><span className="font-bold text-gray-600">هل تم بنجاح؟</span> <span className="text-green-600 font-bold">Yes</span></div>
              <div><span className="text-gray-500">typeof supplierStore:</span> {typeof supplierStore}</div>
              <div><span className="text-gray-500">typeof supplierStore.loadSuppliers:</span> {typeof supplierStore?.loadSuppliers}</div>
              <div><span className="text-gray-500">typeof supplierStore.suppliers:</span> {typeof supplierStore?.suppliers}</div>
            </div>
          )}
        </div>

        {/* Warehouse Store Result */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
          <h2 className="text-lg font-bold text-blue-700 mb-3">Warehouse Store</h2>
          {warehouseError ? (
            <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 font-mono text-left" style={{ direction: 'ltr' }}>
              Error: {warehouseError}
            </div>
          ) : (
            <div className="bg-white p-3 rounded border border-gray-200 font-mono text-sm space-y-2 text-left" style={{ direction: 'ltr' }}>
              <div><span className="font-bold text-gray-600">هل تم بنجاح؟</span> <span className="text-green-600 font-bold">Yes</span></div>
              <div><span className="text-gray-500">typeof warehouseStore:</span> {typeof warehouseStore}</div>
              <div><span className="text-gray-500">typeof warehouseStore.loadWarehouses:</span> {typeof warehouseStore?.loadWarehouses}</div>
              <div><span className="text-gray-500">typeof warehouseStore.warehouses:</span> {typeof warehouseStore?.warehouses}</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PurchasesList;
