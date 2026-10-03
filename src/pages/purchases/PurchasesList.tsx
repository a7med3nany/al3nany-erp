import React from 'react';
import { usePurchaseStore } from '../../store/purchaseStore';

const PurchasesList: React.FC = () => {
  let purchaseStore: any = null;
  let hookError: string | null = null;

  try {
    purchaseStore = usePurchaseStore();
  } catch (error) {
    hookError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="container mx-auto p-6 dir-rtl" style={{ direction: 'rtl' }}>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">شاشة التشخيص (Diagnostic Mode)</h1>
      
      {hookError ? (
        <div className="bg-red-50 text-red-700 p-5 rounded-xl border border-red-200">
          <h2 className="font-bold mb-2">حدث خطأ أثناء استدعاء usePurchaseStore()</h2>
          <p className="font-mono" style={{ direction: 'ltr', textAlign: 'left' }}>
            {hookError}
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200" style={{ direction: 'ltr', textAlign: 'left' }}>
          <div className="mb-6 text-lg">
            <span className="font-bold">هل "usePurchaseStore()" رجع object؟ </span>
            <span className={`font-mono font-bold ${typeof purchaseStore === 'object' && purchaseStore !== null ? 'text-green-600' : 'text-red-600'}`}>
              {typeof purchaseStore === 'object' && purchaseStore !== null ? 'Yes' : 'No'}
            </span>
          </div>

          <div className="space-y-3 mb-8 font-mono text-gray-800 bg-white p-4 rounded border border-gray-200">
            <div>
              <span className="text-gray-500">typeof purchaseStore.loadPurchaseInvoices:</span>{' '}
              <span className="font-bold text-blue-600">{typeof purchaseStore?.loadPurchaseInvoices}</span>
            </div>
            <div>
              <span className="text-gray-500">typeof purchaseStore.purchaseInvoices:</span>{' '}
              <span className="font-bold text-blue-600">{typeof purchaseStore?.purchaseInvoices}</span>
            </div>
            <div>
              <span className="text-gray-500">typeof purchaseStore.isLoading:</span>{' '}
              <span className="font-bold text-blue-600">{typeof purchaseStore?.isLoading}</span>
            </div>
            <div>
              <span className="text-gray-500">typeof purchaseStore.error:</span>{' '}
              <span className="font-bold text-blue-600">{typeof purchaseStore?.error}</span>
            </div>
          </div>

          <div>
            <span className="font-bold block mb-3 text-lg">Object.keys(purchaseStore):</span>
            <pre className="bg-gray-800 text-green-400 p-4 rounded-xl overflow-auto text-sm shadow-inner">
              {JSON.stringify(purchaseStore ? Object.keys(purchaseStore) : [], null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasesList;
