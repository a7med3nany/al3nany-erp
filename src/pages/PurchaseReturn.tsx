import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  Save,
  AlertCircle,
  CreditCard,
  Box,
  RotateCcw,
  Building2,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { usePurchaseStore } from '../store/purchaseStore';
import { useSupplierStore } from '../store/supplierStore';
import { useProductStore } from '../store/productStore';
import { useWarehouseStore } from '../store/warehouseStore';
import { useCashboxStore } from '../store/cashboxStore';
import { auth } from '../config/firebase';

interface ReturnItemState {
  quantity: number;
  returnPrice: number;
}

const PurchaseReturn: React.FC = () => {
  const navigate = useNavigate();

  const { purchaseInvoices, addPurchaseReturn, isLoading: isSaving } =
    usePurchaseStore();

  const { suppliers, loadSuppliers } = useSupplierStore();

  const { products, fetchProducts } = useProductStore();

  const { warehouses, fetchWarehouses } = useWarehouseStore();

  const { cashboxes, fetchCashboxes } = useCashboxStore();

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const [returnItems, setReturnItems] = useState<
    Record<string, ReturnItemState>
  >({});

  const [refundMethod, setRefundMethod] = useState<
    'cash' | 'supplier_credit'
  >('supplier_credit');

  const [cashboxId, setCashboxId] = useState('');

  const [returnSessionId, setReturnSessionId] = useState<string>(() =>
    crypto.randomUUID()
  );

  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    loadSuppliers();
    fetchProducts();
    fetchWarehouses();
    fetchCashboxes();
  }, [loadSuppliers, fetchProducts, fetchWarehouses, fetchCashboxes]);

  const supplierPurchaseData = useMemo(() => {
    if (!supplierId) {
      return [];
    }

    return purchaseInvoices.filter(
      (invoice) =>
        invoice.supplierId === supplierId &&
        invoice.status !== 'cancelled'
    );
  }, [purchaseInvoices, supplierId]);

  const supplierProductIds = useMemo(() => {
    const ids = new Set<string>();

    supplierPurchaseData.forEach((invoice) => {
      invoice.items.forEach((item) => {
        ids.add(item.productId);
      });
    });

    return ids;
  }, [supplierPurchaseData]);

  const supplierProducts = useMemo(() => {
    const activeProducts = products.filter(
      (product) =>
        product.isActive &&
        !product.isDeleted &&
        supplierProductIds.has(product.id)
    );

    if (!productSearch.trim()) {
      return activeProducts;
    }

    const query = productSearch.trim().toLowerCase();

    return activeProducts.filter((product) => {
      const name = product.name.toLowerCase();
      const sku = product.sku?.toLowerCase() || '';
      const barcode = product.barcode?.toLowerCase() || '';

      return (
        name.includes(query) ||
        sku.includes(query) ||
        barcode.includes(query)
      );
    });
  }, [products, supplierProductIds, productSearch]);

  const selectedSupplier = useMemo(() => {
    return suppliers.find((supplier) => supplier.id === supplierId) || null;
  }, [suppliers, supplierId]);

  const selectedWarehouse = useMemo(() => {
    return warehouses.find((warehouse) => warehouse.id === warehouseId) || null;
  }, [warehouses, warehouseId]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) {
      return suppliers.filter((supplier) => supplier.isActive);
    }

    const query = supplierSearch.trim().toLowerCase();

    return suppliers
      .filter((supplier) => supplier.isActive)
      .filter((supplier) => {
        const name = supplier.name.toLowerCase();
        const phone = supplier.phone?.toLowerCase() || '';

        return name.includes(query) || phone.includes(query);
      })
      .slice(0, 10);
  }, [suppliers, supplierSearch]);

  const selectedItems = useMemo(() => {
    return Object.entries(returnItems).filter(
      ([, item]) => item.quantity > 0
    );
  }, [returnItems]);

  const totalReturnAmount = useMemo(() => {
    const total = selectedItems.reduce((sum, [, item]) => {
      return sum + item.quantity * item.returnPrice;
    }, 0);

    return Number(total.toFixed(4));
  }, [selectedItems]);

  const handleSupplierSelect = (id: string) => {
    setSupplierId(id);
    setWarehouseId('');
    setReturnItems({});
    setCashboxId('');
    setRefundMethod('supplier_credit');
    setSupplierSearch('');
    setProductSearch('');
    setFormError('');
    setReturnSessionId(crypto.randomUUID());
  };

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id);
    setReturnItems({});
    setCashboxId('');
    setRefundMethod('supplier_credit');
    setFormError('');
    setReturnSessionId(crypto.randomUUID());
  };

  const handleProductAdd = (productId: string) => {
    if (!warehouseId) {
      setFormError('يجب اختيار المخزن أولاً.');
      return;
    }

    const product = products.find((item) => item.id === productId);

    if (!product) {
      setFormError('المنتج المحدد غير موجود.');
      return;
    }

    setReturnItems((prev) => ({
      ...prev,
      [productId]: prev[productId] || {
        quantity: 1,
        returnPrice: product.averageCost ?? product.lastPurchaseCost ?? 0,
      },
    }));

    setProductSearch('');
    setFormError('');
  };

  const handleQuantityChange = (productId: string, value: string) => {
    if (value === '') {
      setReturnItems((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          quantity: 0,
        },
      }));
      return;
    }

    const quantity = Number(value);

    if (!Number.isFinite(quantity) || quantity < 0) {
      return;
    }

    setReturnItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        quantity,
      },
    }));
  };

  const handleReturnPriceChange = (productId: string, value: string) => {
    if (value === '') {
      setReturnItems((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          returnPrice: 0,
        },
      }));
      return;
    }

    const returnPrice = Number(value);

    if (!Number.isFinite(returnPrice) || returnPrice < 0) {
      return;
    }

    setReturnItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        returnPrice,
      },
    }));
  };

  const removeProduct = (productId: string) => {
    setReturnItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const validateForm = (): boolean => {
    setFormError('');

    if (!supplierId) {
      setFormError('يجب اختيار المورد.');
      return false;
    }

    if (!selectedSupplier) {
      setFormError('المورد المحدد غير موجود.');
      return false;
    }

    if (!warehouseId) {
      setFormError('يجب اختيار المخزن.');
      return false;
    }

    if (!selectedWarehouse) {
      setFormError('المخزن المحدد غير موجود.');
      return false;
    }

    if (selectedItems.length === 0) {
      setFormError('يجب إضافة صنف واحد على الأقل إلى المرتجع.');
      return false;
    }

    for (const [productId, item] of selectedItems) {
      if (item.quantity <= 0) {
        setFormError('يجب أن تكون كمية المرتجع أكبر من صفر.');
        return false;
      }

      if (item.returnPrice < 0) {
        setFormError('سعر المرتجع لا يمكن أن يكون سالبًا.');
        return false;
      }

      const product = products.find((product) => product.id === productId);

      if (!product) {
        setFormError('يوجد منتج غير موجود ضمن المرتجع.');
        return false;
      }
    }

    if (totalReturnAmount <= 0) {
      setFormError('إجمالي قيمة المرتجع يجب أن يكون أكبر من صفر.');
      return false;
    }

    if (refundMethod === 'cash' && !cashboxId) {
      setFormError('يجب اختيار الخزينة عند استرداد قيمة المرتجع نقدًا.');
      return false;
    }

    if (!auth.currentUser?.uid) {
      setFormError('يجب تسجيل الدخول لإتمام العملية.');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const returnId = `ret_${returnSessionId}`;
      const returnNumber = `PRET-${returnSessionId
        .replace(/-/g, '')
        .slice(0, 10)
        .toUpperCase()}`;

      const items = selectedItems.map(([productId, item]) => ({
        lineId: `${returnId}_line_${productId}`,
        productId,
        quantity: item.quantity,
        returnPrice: item.returnPrice,
      }));

      await addPurchaseReturn({
        returnId,
        returnNumber,
        supplierId,
        warehouseId,
        items,
        refundMethod,
        cashboxId: refundMethod === 'cash' ? cashboxId : undefined,
        createdBy: auth.currentUser!.uid,
      });

      setIsSuccess(true);

      setTimeout(() => {
        navigate('/purchases');
      }, 2000);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء حفظ المرتجع.'
      );
    }
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto p-6 dir-rtl min-h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-green-50 text-green-700 p-8 rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Save className="w-8 h-8 text-green-600" />
          </div>

          <h2 className="text-2xl font-bold">تم حفظ المرتجع بنجاح</h2>

          <p>
            تم تسجيل المرتجع وتحديث المخزون وحساب المورد بنجاح.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <RotateCcw className="w-6 h-6 text-orange-600" />
              إنشاء مرتجع مشتريات
            </h1>

            <p className="text-sm text-gray-500">
              إرجاع بضاعة للمورد وتسوية الحسابات الخاصة بها.
            </p>
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
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Building2 className="w-5 h-5 text-blue-600" />
              بيانات المرتجع
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                المورد
              </label>

              {selectedSupplier ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      المورد المحدد
                    </p>
                    <p className="font-bold text-gray-900">
                      {selectedSupplier.name}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSupplierId('');
                      setWarehouseId('');
                      setReturnItems({});
                      setCashboxId('');
                      setSupplierSearch('');
                      setProductSearch('');
                      setFormError('');
                      setReturnSessionId(crypto.randomUUID());
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
                  >
                    تغيير المورد
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />

                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="ابحث باسم المورد أو رقم الهاتف..."
                    className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />

                  {supplierSearch && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                      {filteredSuppliers.length > 0 ? (
                        filteredSuppliers.map((supplier) => (
                          <button
                            key={supplier.id}
                            type="button"
                            onClick={() => handleSupplierSelect(supplier.id)}
                            className="w-full text-right px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                          >
                            <span className="font-semibold text-gray-800 block">
                              {supplier.name}
                            </span>

                            {supplier.phone && (
                              <span className="text-sm text-gray-500">
                                {supplier.phone}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-center text-gray-500 text-sm">
                          لا يوجد مورد مطابق للبحث.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <WarehouseIcon className="w-4 h-4 text-blue-600" />
                المخزن
              </label>

              <select
                value={warehouseId}
                onChange={(e) => handleWarehouseChange(e.target.value)}
                disabled={!supplierId}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">اختر المخزن...</option>

                {warehouses
                  .filter((warehouse) => warehouse.isActive)
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {supplierId && warehouseId && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
                <Box className="w-5 h-5 text-blue-600" />
                إضافة الأصناف المرتجعة
              </h2>

              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />

                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="ابحث عن صنف تم شراؤه من هذا المورد..."
                  className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />

                {productSearch && (
                  <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                    {supplierProducts.length > 0 ? (
                      supplierProducts.slice(0, 10).map((product) => {
                        const alreadyAdded = !!returnItems[product.id];

                        return (
                          <button
                            key={product.id}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => handleProductAdd(product.id)}
                            className="w-full text-right px-4 py-3 hover:bg-blue-50 disabled:bg-gray-50 disabled:text-gray-400 border-b border-gray-100 last:border-0"
                          >
                            <span className="font-semibold block">
                              {product.name}
                            </span>

                            <span className="text-xs text-gray-500">
                              {product.sku || product.barcode || 'بدون كود'}
                            </span>

                            {alreadyAdded && (
                              <span className="text-xs text-orange-600 block mt-1">
                                مضاف بالفعل
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-4 text-center text-gray-500 text-sm">
                        لا توجد أصناف مطابقة لهذا المورد.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-xl">
                  <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    ابحث عن صنف وأضفه إلى المرتجع.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">
                          الصنف
                        </th>

                        <th className="px-4 py-3 font-semibold text-center">
                          الكمية
                        </th>

                        <th className="px-4 py-3 font-semibold text-center">
                          سعر المرتجع
                        </th>

                        <th className="px-4 py-3 font-semibold text-center">
                          الإجمالي
                        </th>

                        <th className="px-4 py-3 w-16"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {selectedItems.map(([productId, item]) => {
                        const product = products.find(
                          (currentProduct) =>
                            currentProduct.id === productId
                        );

                        if (!product) {
                          return null;
                        }

                        const lineTotal = Number(
                          (item.quantity * item.returnPrice).toFixed(4)
                        );

                        return (
                          <tr key={productId} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <div className="font-semibold text-gray-800">
                                {product.name}
                              </div>

                              <div className="text-xs text-gray-500 mt-1">
                                {product.sku ||
                                  product.barcode ||
                                  'بدون كود'}
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleQuantityChange(
                                    productId,
                                    e.target.value
                                  )
                                }
                                className="w-28 mx-auto block px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
                              />
                            </td>

                            <td className="px-4 py-4">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.returnPrice}
                                onChange={(e) =>
                                  handleReturnPriceChange(
                                    productId,
                                    e.target.value
                                  )
                                }
                                className="w-32 mx-auto block px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-orange-700"
                              />
                            </td>

                            <td className="px-4 py-4 text-center font-bold text-gray-800">
                              {lineTotal.toLocaleString()} ج.م
                            </td>

                            <td className="px-4 py-4 text-center">
                              <button
                                type="button"
                                onClick={() => removeProduct(productId)}
                                className="text-red-500 hover:text-red-700 text-sm font-medium"
                              >
                                حذف
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800">
                سيتم التحقق عند الحفظ من أن الصنف تم شراؤه فعليًا من المورد
                المحدد، وأن الكمية المطلوب إرجاعها متاحة في المخزن.
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-3 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              التسوية المالية
            </h2>

            {!supplierId || !warehouseId ? (
              <div className="text-center py-10 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  اختر المورد والمخزن أولاً.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
                  <span className="text-sm text-gray-500 block mb-1">
                    إجمالي قيمة المرتجع
                  </span>

                  <span className="text-2xl font-black text-gray-900">
                    {totalReturnAmount.toLocaleString()} ج.م
                  </span>

                  <p className="text-xs text-gray-400 mt-1">
                    سعر التسوية يحدده المستخدم لكل صنف.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    طريقة التسوية
                  </label>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="refundMethod"
                        value="supplier_credit"
                        checked={refundMethod === 'supplier_credit'}
                        onChange={() => {
                          setRefundMethod('supplier_credit');
                          setCashboxId('');
                        }}
                        className="w-4 h-4"
                      />

                      <div>
                        <p className="font-semibold text-gray-800">
                          رصيد دائن لدى المورد
                        </p>

                        <p className="text-xs text-gray-500">
                          يتم تخفيض مديونية المورد أو إنشاء رصيد دائن لنا.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="refundMethod"
                        value="cash"
                        checked={refundMethod === 'cash'}
                        onChange={() => setRefundMethod('cash')}
                        className="w-4 h-4"
                      />

                      <div>
                        <p className="font-semibold text-gray-800">
                          استرداد نقدي كامل
                        </p>

                        <p className="text-xs text-gray-500">
                          المورد يعيد قيمة المرتجع نقدًا إلى الخزينة.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {refundMethod === 'cash' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      الخزينة المستلمة للمبلغ{' '}
                      <span className="text-red-500">*</span>
                    </label>

                    <select
                      value={cashboxId}
                      onChange={(e) => setCashboxId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">اختر الخزينة...</option>

                      {cashboxes
                        ?.filter((cashbox) => cashbox.isActive)
                        .map((cashbox) => (
                          <option key={cashbox.id} value={cashbox.id}>
                            {cashbox.name} (
                            {cashbox.balance.toLocaleString()} ج.م)
                          </option>
                        ))}
                    </select>

                    <p className="text-xs text-gray-500">
                      سيتم تسجيل المبلغ كحركة دخول إلى الخزينة.
                    </p>
                  </div>
                )}

                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-orange-800">
                      قيمة التسوية
                    </span>

                    <span className="font-bold text-orange-700 text-lg">
                      {totalReturnAmount.toLocaleString()} ج.م
                    </span>
                  </div>

                  <p className="text-xs text-orange-700 mt-2">
                    سيتم تسجيل حركة مورد من نوع خروج بقيمة المرتجع.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
            disabled={
              isSaving ||
              !supplierId ||
              !warehouseId ||
              selectedItems.length === 0 ||
              totalReturnAmount <= 0
            }
            className="px-8 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 min-w-[200px] justify-center"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <RotateCcw className="w-5 h-5" />
                تأكيد المرتجع
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReturn;
