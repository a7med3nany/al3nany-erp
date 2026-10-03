import React, { useEffect, useState } from 'react';
import { usePurchaseStore } from '../../store/purchaseStore';

const PurchasesList: React.FC = () => {
  const { loadPurchaseInvoices, purchaseInvoices } = usePurchaseStore();
  
  const [status, setStatus] = useState('لم يبدأ الاختبار');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const testLoad = async () => {
      try {
        setStatus('جاري استدعاء loadPurchaseInvoices...');
        await loadPurchaseInvoices();
        setStatus('تم تنفيذ loadPurchaseInvoices بنجاح');
      } catch (error) {
        setStatus('حدث خطأ أثناء loadPurchaseInvoices');
        setErrorMessage(error instanceof Error ? error.message : String(error));
        console.error("Diagnostic Error:", error);
      }
    };

    testLoad();
  }, [loadPurchaseInvoices]);

  return (
    <div className="container mx-auto p-6 dir-rtl" style={{ direction: 'rtl' }}>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">شاشة التشخيص 2 (Action Test)</h1>
      
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
        
        {/* حالة التنفيذ */}
        <div className="mb-6 text-lg">
          <span className="font-bold text-gray-700">الحالة: </span>
          <span className={`font-semibold ${errorMessage ? 'text-red-600' : 'text-blue-600'}`}>
            {status}
          </span>
        </div>

        {/* رسالة الخطأ إن وجدت */}
        {errorMessage && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 mb-6" style={{ direction: 'ltr', textAlign: 'left' }}>
            <h3 className="font-bold mb-2">Error Message:</h3>
            <p className="font-mono text-sm">{errorMessage}</p>
          </div>
        )}

        {/* بيانات الـ Store بعد التنفيذ */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800">بيانات الفواتير:</h2>
          
          <div className="mb-4 text-lg">
            <span className="font-bold text-gray-700">purchaseInvoices.length: </span>
            <span className="font-mono font-bold text-green-600">
              {purchaseInvoices ? purchaseInvoices.length : 'undefined'}
            </span>
          </div>

          {purchaseInvoices && purchaseInvoices.length > 0 && (
            <div>
              <span className="font-bold text-gray-700 block mb-3">أول عنصر في المصفوفة:</span>
              <pre className="bg-gray-800 text-green-400 p-4 rounded-xl overflow-auto text-sm shadow-inner" style={{ direction: 'ltr', textAlign: 'left' }}>
                {JSON.stringify(purchaseInvoices[0], null, 2)}
              </pre>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PurchasesList;
