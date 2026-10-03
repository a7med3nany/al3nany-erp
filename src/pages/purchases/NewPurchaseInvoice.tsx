import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Search, Plus, Trash2, Save, AlertCircle, 
  Store, User, Receipt, CreditCard, Box, Tag
} from 'lucide-react';
import { usePurchaseStore } from '../../store/purchaseStore';
import { useSupplierStore } from '../../store/supplierStore';
import { useProductStore } from '../../store/productStore';
import { useWarehouseStore } from '../../store/warehouseStore';
import { useCashboxStore } from '../../store/cashboxStore';
import { auth } from '../../config/firebase';
import { Product } from '../../types';

interface InvoiceItem {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number | '';
  purchasePrice: number | '';
  grossLineTotal: number;
  sellPrice1?: number;
  sellPrice2?: number;
  sellPrice3?: number;
  sellPrice4?: number;
}

const NewPurchaseInvoice: React.FC = () => {
  const navigate = useNavigate();

  // Stores
  const { addPurchaseInvoice, isLoading: isSaving } = usePurchaseStore();
  const { suppliers, loadSuppliers } = useSupplierStore();
  const { products, fetchProducts } = useProductStore(); 
  const { warehouses, fetchWarehouses } = useWarehouseStore(); 
  const { cashboxes, fetchCashboxes } = useCashboxStore();

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState<number | ''>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'partial'>('credit');
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [cashboxId, setCashboxId] = useState('');
  
  // UI State
  const [productSearch, setProductSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [expandedPricingLines, setExpandedPricingLines] = useState<Record<string, boolean>>({});

  // Initial Data Load
  useEffect(() => {
    loadSuppliers();
    fetchWarehouses();
    fetchProducts();
    fetchCashboxes();
    
    // Auto-generate invoice number (for UI convenience, user can change it)
    setInvoiceNumber(`PINV-${Date.now().toString().slice(-6)}`);
  }, [loadSuppliers, fetchWarehouses, fetchProducts, fetchCashboxes]);

  // Derived Calculations (Raw math exposed to validation)
  const numDiscount = Number(discount) || 0;
  const numAdditionalCharges = Number(additionalCharges) || 0;
  const numPaidAmount = Number(paidAmount) || 0;

  const subtotal = items.reduce((sum, item) => sum + (item.grossLineTotal || 0), 0);
  const totalAmount = subtotal - numDiscount + numAdditionalCharges;
  const remainingAmount = totalAmount - numPaidAmount;

  // Sync paid amount based on payment method and total changes
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setPaidAmount(totalAmount > 0 ? totalAmount : 0);
    } else if (paymentMethod === 'credit') {
      setPaidAmount(0);
    }
    // For 'partial', we intentionally DO NOT auto-adjust paidAmount if totalAmount changes.
    // We let the Validation catch it so the user explicitly fixes their partial payment.
  }, [paymentMethod, totalAmount]);

  // Filtered Products for Search
  const searchResults = useMemo(() => {
    if (!productSearch.trim()) return [];
    const query = productSearch.toLowerCase();
    return products.filter(p => 
      p.isActive !== false && 
      (p.name.toLowerCase().includes(query) || 
       (p.sku && p.sku.toLowerCase().includes(query)) || 
       (p.barcode && p.barcode.toLowerCase().includes(query)))
    ).slice(0, 5); // Limit results for performance
  }, [products, productSearch]);

  // Handlers
  const handleAddProduct = (product: Product) => {
    if (items.some(item => item.productId === product.id)) {
      setFormError(`المنتج "${product.name}" مضاف بالفعل للفاتورة.`);
      setProductSearch('');
      return;
    }

    const defaultPrice = product.lastPurchaseCost || 0;
    const newItem: InvoiceItem = {
      lineId: `line_${Math.random().toString(36).substr(2, 9)}`,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      purchasePrice: defaultPrice,
      grossLineTotal: defaultPrice,
      sellPrice1: product.sellPrice1,
      sellPrice2: product.sellPrice2,
      sellPrice3: product.sellPrice3,
      sellPrice4: product.sellPrice4,
    };

    setItems([...items, newItem]);
    setProductSearch('');
    setFormError('');
  };

  // TypeScript generic restricts value type to match the field type precisely
  const handleUpdateItem = <K extends keyof InvoiceItem>(lineId: string, field: K, value: InvoiceItem[K]) => {
    setItems(currentItems => 
      currentItems.map(item => {
        if (item.lineId === lineId) {
          const updatedItem = { ...item, [field]: value };
          // أعد حساب الإجمالي إذا تغيرت الكمية أو سعر الشراء وقيمهما صالحة
          if (field === 'quantity' || field === 'purchasePrice') {
            const q = Number(updatedItem.quantity) || 0;
            const p = Number(updatedItem.purchasePrice) || 0;
            updatedItem.grossLineTotal = Number((q * p).toFixed(4));
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (lineId: string) => {
    setItems(items.filter(item => item.lineId !== lineId));
  };

  const togglePricingLine = (lineId: string) => {
    setExpandedPricingLines(prev => ({ ...prev, [lineId]: !prev[lineId] }));
  };

  const validateForm = (): boolean => {
    setFormError('');
    
    if (!invoiceNumber.trim()) return setFormError('رقم الفاتورة مطلوب.'), false;
    if (!supplierId) return setFormError('يجب اختيار المورد.'), false;
    if (!warehouseId) return setFormError('يجب اختيار المخزن للاستلام.'), false;
    if (items.length === 0) return setFormError('يجب إضافة منتج واحد على الأقل للفاتورة.'), false;
    
    if (items.some(i => i.quantity === '' || Number(i.quantity) <= 0)) return setFormError('جميع الكميات يجب أن تكون أرقاماً صالحة وأكبر من صفر.'), false;
    if (items.some(i => i.purchasePrice === '' || Number(i.purchasePrice) < 0)) return setFormError('جميع أسعار الشراء يجب أن تكون أرقاماً صالحة وغير سالبة.'), false;

    if (numDiscount < 0) return setFormError('الخصم لا يمكن أن يكون سالباً.'), false;
    if (numAdditionalCharges < 0) return setFormError('المصاريف الإضافية لا يمكن أن تكون سالبة.'), false;
    if (numPaidAmount < 0) return setFormError('المبلغ المدفوع لا يمكن أن يكون سالباً.'), false;
    
    if (numDiscount > subtotal) return setFormError('الخصم لا يمكن أن يتجاوز إجمالي الأصناف.'), false;
    if (subtotal === 0 && numAdditionalCharges > 0) return setFormError('لا يمكن إضافة مصاريف إذا كان إجمالي الأصناف صفراً.'), false;

    if (totalAmount < 0) return setFormError('إجمالي الفاتورة غير صالح (سالب).'), false;

    const TOLERANCE = 0.0001;

    if (paymentMethod === 'cash' && Math.abs(numPaidAmount - totalAmount) > TOLERANCE) {
      return setFormError('الدفع النقدي يتطلب سداد الإجمالي بالكامل.'), false;
    }
    if (paymentMethod === 'credit' && numPaidAmount > 0) {
      return setFormError('الشراء الآجل لا يجب أن يحتوي على مبلغ مدفوع.'), false;
    }
    if (paymentMethod === 'partial') {
      if (numPaidAmount <= 0) return setFormError('في الدفع الجزئي يجب إدخال مبلغ مدفوع أكبر من صفر.'), false;
      if (numPaidAmount > totalAmount - TOLERANCE) return setFormError('في الدفع الجزئي يجب أن يكون المبلغ المدفوع أقل من الإجمالي.'), false;
    }

    if (numPaidAmount > 0 && !cashboxId) return setFormError('يجب اختيار الخزينة لتسجيل الدفعة.'), false;
    
    if (!auth.currentUser?.uid) return setFormError('يجب تسجيل الدخول لإتمام العملية.'), false;

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      // Generate a Unique ID for this submission (helps Firebase handle network retries safely)
      const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      await addPurchaseInvoice({
        invoiceId,
        invoiceNumber,
        supplierId,
        warehouseId,
        items: items.map(item => ({
          lineId: item.lineId,
          productId: item.productId,
          quantity: Number(item.quantity) || 0,
          purchasePrice: Number(item.purchasePrice) || 0,
          sellPrice1: item.sellPrice1,
          sellPrice2: item.sellPrice2,
          sellPrice3: item.sellPrice3,
          sellPrice4: item.sellPrice4
        })),
        discount: numDiscount,
        additionalCharges: numAdditionalCharges,
        paidAmount: numPaidAmount,
        paymentMethod,
        cashboxId: numPaidAmount > 0 ? cashboxId : undefined,
        createdBy: auth.currentUser!.uid
      });

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/purchases');
      }, 1500);

    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الفاتورة.');
    }
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto p-6 dir-rtl min-h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-green-50 text-green-700 p-8 rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Save className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">تم الحفظ بنجاح</h2>
          <p>تم إنشاء الفاتورة وتحديث المخزون وحساب المورد بنجاح.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">فاتورة مشتريات جديدة</h1>
            <p className="text-sm text-gray-500">إدخال بضاعة للمخزن وتسجيل التزامات الموردين.</p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="font-medium text-sm">{formError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Form Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Basic Info */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Receipt className="w-5 h-5 text-blue-600" /> البيانات الأساسية
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">رقم الفاتورة <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  placeholder="رقم الإيصال..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex justify-between">
                  <span>المورد <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                  >
                    <option value="">اختر المورد...</option>
                    {suppliers.filter(s => s.isActive).map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">مخزن الاستلام <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Store className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                  >
                    <option value="">اختر المخزن...</option>
                    {warehouses?.filter(w => w.isActive).map(warehouse => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Items */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Box className="w-5 h-5 text-blue-600" /> الأصناف
            </h2>

            {/* Product Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="ابحث باسم المنتج، SKU أو الباركود لإضافته..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Search Results Dropdown */}
              {productSearch && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleAddProduct(product)}
                        className="w-full text-right px-4 py-3 hover:bg-blue-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{product.name}</p>
                          {(product.sku || product.barcode) && (
                            <p className="text-xs text-gray-500 mt-0.5">{product.sku} {product.barcode ? `| ${product.barcode}` : ''}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                          <Plus className="w-4 h-4" /> إضافة
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-center text-gray-500 text-sm">لا توجد منتجات مطابقة للبحث.</div>
                  )}
                </div>
              )}
            </div>

            {/* Desktop Items Table & Mobile Cards */}
            {items.length > 0 ? (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.lineId} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Main Row */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 bg-gray-50/50">
                      <div className="flex-1">
                        <span className="font-medium text-gray-900 block">{index + 1}. {item.productName}</span>
                      </div>
                      
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">
                        <div className="w-24 shrink-0 space-y-1">
                          <label className="text-xs text-gray-500 md:hidden">الكمية</label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(item.lineId, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-sm"
                            placeholder="الكمية"
                          />
                        </div>
                        <div className="w-28 shrink-0 space-y-1">
                          <label className="text-xs text-gray-500 md:hidden">سعر الشراء</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.purchasePrice}
                            onChange={(e) => handleUpdateItem(item.lineId, 'purchasePrice', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-sm"
                            placeholder="سعر الشراء"
                          />
                        </div>
                        <div className="w-28 shrink-0 text-left space-y-1">
                          <label className="text-xs text-gray-500 md:hidden block">الإجمالي</label>
                          <span className="font-bold text-gray-900 block py-1.5">{item.grossLineTotal.toLocaleString()} ج.م</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 md:border-r md:border-gray-200 md:pr-3">
                          <button
                            onClick={() => togglePricingLine(item.lineId)}
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 bg-blue-50 rounded"
                            title="تحديث أسعار البيع"
                          >
                            <Tag className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveItem(item.lineId)}
                            className="text-red-500 hover:text-red-700 transition-colors p-1.5 bg-red-50 rounded"
                            title="حذف الصنف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-row: Sell Prices (Expandable) */}
                    {expandedPricingLines[item.lineId] && (
                      <div className="p-4 border-t border-gray-100 bg-white grid grid-cols-2 md:grid-cols-4 gap-3 animate-in slide-in-from-top-2">
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">سعر البيع 1</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.sellPrice1 ?? ''}
                            onChange={(e) => handleUpdateItem(item.lineId, 'sellPrice1', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">سعر البيع 2</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.sellPrice2 ?? ''}
                            onChange={(e) => handleUpdateItem(item.lineId, 'sellPrice2', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">سعر البيع 3</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.sellPrice3 ?? ''}
                            onChange={(e) => handleUpdateItem(item.lineId, 'sellPrice3', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">سعر البيع 4</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.sellPrice4 ?? ''}
                            onChange={(e) => handleUpdateItem(item.lineId, 'sellPrice4', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <Box className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">لم يتم إضافة أي أصناف بعد.</p>
                <p className="text-xs text-gray-400 mt-1">استخدم شريط البحث أعلاه لإضافة المنتجات</p>
              </div>
            )}
          </div>

        </div>

        {/* Sidebar: Financials & Payment */}
        <div className="space-y-6">
          
          {/* Section 3: Summary */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-3">ملخص الحساب</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-gray-600">
                <span>إجمالي الأصناف:</span>
                <span className="font-semibold text-gray-800">{subtotal.toLocaleString()} ج.م</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">الخصم (-):</span>
                <div className="w-1/3 relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-left focus:outline-none focus:ring-1 focus:ring-blue-500 text-red-600 font-medium"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">مصاريف نقل/اقتناء (+):</span>
                <div className="w-1/3 relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={additionalCharges}
                    onChange={(e) => setAdditionalCharges(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-left focus:outline-none focus:ring-1 focus:ring-blue-500 text-orange-600 font-medium"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">الصافي المطلوب:</span>
                <span className="font-black text-xl text-blue-600">{totalAmount.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          {/* Section 4: Payment */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <CreditCard className="w-5 h-5 text-blue-600" /> الدفع والتسوية
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">طريقة الدفع</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'credit', 'partial'] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 text-sm font-medium rounded-lg border transition-all ${
                        paymentMethod === method 
                          ? 'bg-blue-50 border-blue-600 text-blue-700' 
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {method === 'cash' ? 'نقدي' : method === 'credit' ? 'آجل' : 'جزئي'}
                    </button>
                  ))}
                </div>
              </div>

              {(paymentMethod === 'cash' || paymentMethod === 'partial') && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-gray-700">خزينة السداد <span className="text-red-500">*</span></label>
                  <select
                    value={cashboxId}
                    onChange={(e) => setCashboxId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">اختر الخزنة...</option>
                    {cashboxes?.filter(c => c.isActive).map(cashbox => (
                      <option key={cashbox.id} value={cashbox.id}>{cashbox.name} ({cashbox.balance.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
              )}

              {paymentMethod === 'partial' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-gray-700">المبلغ المدفوع <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold text-blue-700"
                  />
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center mt-4">
                <span className="text-sm font-medium text-gray-600">المتبقي (آجل):</span>
                <span className={`font-bold ${remainingAmount > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                  {remainingAmount.toLocaleString()} ج.م
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Floating Action Bar (Submit) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="container mx-auto flex justify-end gap-4 px-4 md:px-6">
          <button
            onClick={() => navigate(-1)}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || items.length === 0}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 min-w-[200px] justify-center"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" /> حفظ الفاتورة
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
};

export default NewPurchaseInvoice;
