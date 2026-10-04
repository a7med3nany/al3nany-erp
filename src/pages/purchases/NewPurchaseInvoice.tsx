import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Store,
  User,
  Receipt,
  CreditCard,
  Box,
  Tag,
  X
} from 'lucide-react';

import { usePurchaseStore } from '../../store/purchaseStore';
import { useSupplierStore } from '../../store/supplierStore';
import { useProductStore } from '../../store/productStore';
import { useCategoryStore } from '../../store/categoryStore';
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

  // ==========================================
  // Stores
  // ==========================================
  const { addPurchaseInvoice, isLoading: isSaving } = usePurchaseStore();

  const {
    suppliers,
    loadSuppliers,
    addSupplier,
    isLoading: isSupplierLoading
  } = useSupplierStore();

  const {
    products,
    fetchProducts,
    addProduct,
    isLoading: isProductLoading
  } = useProductStore();

  const {
    categories,
    fetchCategories,
    addCategory,
    isLoading: isCategoryLoading
  } = useCategoryStore();

  const {
    warehouses,
    fetchWarehouses
  } = useWarehouseStore();

  const {
    cashboxes,
    fetchCashboxes
  } = useCashboxStore();

  // ==========================================
  // Stable IDs
  // ==========================================
  const invoiceIdRef = useRef(
    `inv_${Date.now()}_${crypto.randomUUID()}`
  );

  // ==========================================
  // Form State
  // ==========================================
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState<number | ''>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'credit' | 'partial'
  >('credit');
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [cashboxId, setCashboxId] = useState('');

  // ==========================================
  // UI State
  // ==========================================
  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const [expandedPricingLines, setExpandedPricingLines] = useState<
    Record<string, boolean>
  >({});

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // ==========================================
  // New Supplier State
  // ==========================================
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');

  // ==========================================
  // New Product State
  // ==========================================
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductPrice1, setNewProductPrice1] = useState<number | ''>('');
  const [newProductPrice2, setNewProductPrice2] = useState<number | ''>('');
  const [newProductPrice3, setNewProductPrice3] = useState<number | ''>('');
  const [newProductPrice4, setNewProductPrice4] = useState<number | ''>('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState<
    number | ''
  >(0);

  // ==========================================
  // New Category State
  // ==========================================
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');

  // ==========================================
  // Initial Data Load
  // ==========================================
  useEffect(() => {
    loadSuppliers();
    fetchWarehouses();
    fetchProducts();
    fetchCashboxes();
    fetchCategories();

    setInvoiceNumber(`PINV-${Date.now().toString().slice(-6)}`);
  }, [
    loadSuppliers,
    fetchWarehouses,
    fetchProducts,
    fetchCashboxes,
    fetchCategories
  ]);

  // ==========================================
  // Derived Calculations
  // ==========================================
  const numDiscount = Number(discount) || 0;
  const numAdditionalCharges = Number(additionalCharges) || 0;
  const numPaidAmount = Number(paidAmount) || 0;

  const subtotal = items.reduce(
    (sum, item) => sum + (item.grossLineTotal || 0),
    0
  );

  const totalAmount =
    subtotal - numDiscount + numAdditionalCharges;

  const remainingAmount =
    totalAmount - numPaidAmount;

  // ==========================================
  // Payment Synchronization
  // ==========================================
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setPaidAmount(totalAmount > 0 ? totalAmount : 0);
    } else if (paymentMethod === 'credit') {
      setPaidAmount(0);
    }
  }, [paymentMethod, totalAmount]);

  // ==========================================
  // Supplier Search
  // ==========================================
  const supplierResults = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();

    if (!query) {
      return suppliers.filter(supplier => supplier.isActive).slice(0, 8);
    }

    return suppliers
      .filter(
        supplier =>
          supplier.isActive &&
          (
            supplier.name.toLowerCase().includes(query) ||
            supplier.phone?.toLowerCase().includes(query)
          )
      )
      .slice(0, 8);
  }, [suppliers, supplierSearch]);

  // ==========================================
  // Product Search
  // ==========================================
  const searchResults = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) return [];

    return products
      .filter(
        product =>
          product.isActive !== false &&
          (
            product.name.toLowerCase().includes(query) ||
            product.sku?.toLowerCase().includes(query) ||
            product.barcode?.toLowerCase().includes(query)
          )
      )
      .slice(0, 8);
  }, [products, productSearch]);

  // ==========================================
  // Category Search
  // ==========================================
  const categoryResults = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();

    if (!query) {
      return categories
        .filter(category => category.isActive)
        .slice(0, 8);
    }

    return categories
      .filter(
        category =>
          category.isActive &&
          category.name.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [categories, categorySearch]);

  // ==========================================
  // Supplier Selection
  // ==========================================
  const handleSelectSupplier = (id: string, name: string) => {
    setSupplierId(id);
    setSupplierSearch(name);
    setFormError('');
  };

  // ==========================================
  // Add Supplier
  // ==========================================
  const handleCreateSupplier = async () => {
    setFormError('');

    const name = newSupplierName.trim();

    if (!name) {
      setFormError('اسم المورد مطلوب.');
      return;
    }

    try {
      await addSupplier({
        name,
        phone: newSupplierPhone.trim() || undefined,
        address: newSupplierAddress.trim() || undefined,
        isActive: true
      });

      const updatedSuppliers = useSupplierStore.getState().suppliers;

      const createdSupplier = updatedSuppliers.find(
        supplier =>
          supplier.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (createdSupplier) {
        setSupplierId(createdSupplier.id);
        setSupplierSearch(createdSupplier.name);
      }

      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierAddress('');
      setShowSupplierModal(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء إضافة المورد.'
      );
    }
  };

  // ==========================================
  // Add Product To Invoice
  // ==========================================
  const handleAddProduct = (product: Product) => {
    if (items.some(item => item.productId === product.id)) {
      setFormError(`المنتج "${product.name}" مضاف بالفعل للفاتورة.`);
      setProductSearch('');
      return;
    }

    const defaultPrice = product.lastPurchaseCost ?? 0;

    const newItem: InvoiceItem = {
      lineId: `${invoiceIdRef.current}_line_${crypto.randomUUID()}`,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      purchasePrice: defaultPrice,
      grossLineTotal: Number(defaultPrice.toFixed(4)),
      sellPrice1: product.price1,
      sellPrice2: product.price2,
      sellPrice3: product.price3,
      sellPrice4: product.price4
    };

    setItems(currentItems => [...currentItems, newItem]);
    setProductSearch('');
    setFormError('');
  };

  // ==========================================
  // Add Category
  // ==========================================
  const handleCreateCategory = async () => {
    setFormError('');

    const name = newCategoryName.trim();

    if (!name) {
      setFormError('اسم التصنيف مطلوب.');
      return;
    }

    try {
      await addCategory({
        name,
        description: newCategoryDescription.trim(),
        isActive: true
      });

      const updatedCategories =
        useCategoryStore.getState().categories;

      const createdCategory = updatedCategories.find(
        category =>
          category.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (createdCategory) {
        setNewProductCategoryId(createdCategory.id);
        setCategorySearch(createdCategory.name);
      }

      setNewCategoryName('');
      setNewCategoryDescription('');
      setShowNewCategoryInput(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء إضافة التصنيف.'
      );
    }
  };

  // ==========================================
  // Add Product
  // ==========================================
  const handleCreateProduct = async () => {
    setFormError('');

    const name = newProductName.trim();

    if (!name) {
      setFormError('اسم المنتج مطلوب.');
      return;
    }

    if (!newProductCategoryId) {
      setFormError('يجب اختيار تصنيف المنتج.');
      return;
    }

    const price1 = Number(newProductPrice1) || 0;
    const price2 =
      newProductPrice2 === '' ? undefined : Number(newProductPrice2);
    const price3 =
      newProductPrice3 === '' ? undefined : Number(newProductPrice3);
    const price4 =
      newProductPrice4 === '' ? undefined : Number(newProductPrice4);

    try {
      await addProduct({
        categoryId: newProductCategoryId,
        name,
        sku: newProductSku.trim() || undefined,
        barcode: newProductBarcode.trim() || undefined,
        price1,
        price2,
        price3,
        price4,
        reorderLevel: Number(newProductReorderLevel) || 0,
        isActive: true
      });

      const updatedProducts =
        useProductStore.getState().products;

      const createdProduct = updatedProducts.find(
        product =>
          product.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (createdProduct) {
        handleAddProduct(createdProduct);
      }

      setNewProductName('');
      setNewProductCategoryId('');
      setNewProductSku('');
      setNewProductBarcode('');
      setNewProductPrice1('');
      setNewProductPrice2('');
      setNewProductPrice3('');
      setNewProductPrice4('');
      setNewProductReorderLevel(0);
      setCategorySearch('');
      setShowProductModal(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء إضافة المنتج.'
      );
    }
  };

  // ==========================================
  // Update Invoice Item
  // ==========================================
  const handleUpdateItem = <
    K extends keyof InvoiceItem
  >(
    lineId: string,
    field: K,
    value: InvoiceItem[K]
  ) => {
    setItems(currentItems =>
      currentItems.map(item => {
        if (item.lineId !== lineId) {
          return item;
        }

        const updatedItem = {
          ...item,
          [field]: value
        };

        if (
          field === 'quantity' ||
          field === 'purchasePrice'
        ) {
          const quantity =
            Number(updatedItem.quantity) || 0;

          const purchasePrice =
            Number(updatedItem.purchasePrice) || 0;

          updatedItem.grossLineTotal = Number(
            (quantity * purchasePrice).toFixed(4)
          );
        }

        return updatedItem;
      })
    );
  };

  const handleRemoveItem = (lineId: string) => {
    setItems(currentItems =>
      currentItems.filter(item => item.lineId !== lineId)
    );
  };

  const togglePricingLine = (lineId: string) => {
    setExpandedPricingLines(previous => ({
      ...previous,
      [lineId]: !previous[lineId]
    }));
  };

  // ==========================================
  // Validation
  // ==========================================
  const validateForm = (): boolean => {
    setFormError('');

    if (!invoiceNumber.trim()) {
      setFormError('رقم الفاتورة مطلوب.');
      return false;
    }

    if (!supplierId) {
      setFormError('يجب اختيار المورد.');
      return false;
    }

    if (!warehouseId) {
      setFormError('يجب اختيار المخزن للاستلام.');
      return false;
    }

    if (items.length === 0) {
      setFormError(
        'يجب إضافة منتج واحد على الأقل للفاتورة.'
      );
      return false;
    }

    if (
      items.some(
        item =>
          item.quantity === '' ||
          Number(item.quantity) <= 0
      )
    ) {
      setFormError(
        'جميع الكميات يجب أن تكون أرقاماً صالحة وأكبر من صفر.'
      );
      return false;
    }

    if (
      items.some(
        item =>
          item.purchasePrice === '' ||
          Number(item.purchasePrice) < 0
      )
    ) {
      setFormError(
        'جميع أسعار الشراء يجب أن تكون أرقاماً صالحة وغير سالبة.'
      );
      return false;
    }

    if (numDiscount < 0) {
      setFormError('الخصم لا يمكن أن يكون سالباً.');
      return false;
    }

    if (numAdditionalCharges < 0) {
      setFormError(
        'المصاريف الإضافية لا يمكن أن تكون سالبة.'
      );
      return false;
    }

    if (numPaidAmount < 0) {
      setFormError(
        'المبلغ المدفوع لا يمكن أن يكون سالباً.'
      );
      return false;
    }

    if (numDiscount > subtotal) {
      setFormError(
        'الخصم لا يمكن أن يتجاوز إجمالي الأصناف.'
      );
      return false;
    }

    if (
      subtotal === 0 &&
      numAdditionalCharges > 0
    ) {
      setFormError(
        'لا يمكن إضافة مصاريف إذا كان إجمالي الأصناف صفراً.'
      );
      return false;
    }

    if (totalAmount < 0) {
      setFormError(
        'إجمالي الفاتورة غير صالح (سالب).'
      );
      return false;
    }

    const TOLERANCE = 0.0001;

    if (
      paymentMethod === 'cash' &&
      Math.abs(numPaidAmount - totalAmount) >
        TOLERANCE
    ) {
      setFormError(
        'الدفع النقدي يتطلب سداد الإجمالي بالكامل.'
      );
      return false;
    }

    if (
      paymentMethod === 'credit' &&
      numPaidAmount > 0
    ) {
      setFormError(
        'الشراء الآجل لا يجب أن يحتوي على مبلغ مدفوع.'
      );
      return false;
    }

    if (paymentMethod === 'partial') {
      if (numPaidAmount <= 0) {
        setFormError(
          'في الدفع الجزئي يجب إدخال مبلغ مدفوع أكبر من صفر.'
        );
        return false;
      }

      if (
        numPaidAmount >=
        totalAmount - TOLERANCE
      ) {
        setFormError(
          'في الدفع الجزئي يجب أن يكون المبلغ المدفوع أقل من الإجمالي.'
        );
        return false;
      }
    }

    if (numPaidAmount > 0 && !cashboxId) {
      setFormError(
        'يجب اختيار الخزينة لتسجيل الدفعة.'
      );
      return false;
    }

    if (!auth.currentUser?.uid) {
      setFormError(
        'يجب تسجيل الدخول لإتمام العملية.'
      );
      return false;
    }

    return true;
  };

  // ==========================================
  // Submit
  // ==========================================
  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await addPurchaseInvoice({
        invoiceId: invoiceIdRef.current,
        invoiceNumber,
        supplierId,
        warehouseId,
        items: items.map(item => ({
          lineId: item.lineId,
          productId: item.productId,
          quantity: Number(item.quantity) || 0,
          purchasePrice:
            Number(item.purchasePrice) || 0,
          sellPrice1: item.sellPrice1,
          sellPrice2: item.sellPrice2,
          sellPrice3: item.sellPrice3,
          sellPrice4: item.sellPrice4
        })),
        discount: numDiscount,
        additionalCharges: numAdditionalCharges,
        paidAmount: numPaidAmount,
        paymentMethod,
        cashboxId:
          numPaidAmount > 0
            ? cashboxId
            : undefined,
        createdBy: auth.currentUser!.uid
      });

      setIsSuccess(true);

      setTimeout(() => {
        navigate('/purchases');
      }, 1500);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء حفظ الفاتورة.'
      );
    }
  };

  // ==========================================
  // Success Screen
  // ==========================================
  if (isSuccess) {
    return (
      <div className="container mx-auto p-6 dir-rtl min-h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-green-50 text-green-700 p-8 rounded-2xl flex flex-col items-center gap-4 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Save className="w-8 h-8 text-green-600" />
          </div>

          <h2 className="text-2xl font-bold">
            تم الحفظ بنجاح
          </h2>

          <p>
            تم إنشاء الفاتورة وتحديث المخزون وحساب المورد بنجاح.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 dir-rtl pb-24">

      {/* ==========================================
          Header
      ========================================== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              فاتورة مشتريات جديدة
            </h1>

            <p className="text-sm text-gray-500">
              إدخال بضاعة للمخزن وتسجيل التزامات الموردين.
            </p>
          </div>
        </div>
      </div>

      {/* ==========================================
          Error
      ========================================== */}
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="font-medium text-sm">
            {formError}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ==========================================
            Main Form
        ========================================== */}
        <div className="lg:col-span-2 space-y-6">

          {/* ==========================================
              Basic Info
          ========================================== */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Receipt className="w-5 h-5 text-blue-600" />
              البيانات الأساسية
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Invoice Number */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  رقم الفاتورة{' '}
                  <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={e =>
                    setInvoiceNumber(e.target.value)
                  }
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  placeholder="رقم الإيصال..."
                />
              </div>

              {/* Supplier Smart Field */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  المورد{' '}
                  <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />

                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value);
                      setSupplierId('');
                    }}
                    placeholder="ابحث عن المورد..."
                    className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />

                  {supplierSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierSearch('');
                        setSupplierId('');
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {(supplierSearch.trim() || suppliers.length > 0) && (
                    <div className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {supplierResults.length > 0 ? (
                        supplierResults.map(supplier => (
                          <button
                            key={supplier.id}
                            type="button"
                            onClick={() =>
                              handleSelectSupplier(
                                supplier.id,
                                supplier.name
                              )
                            }
                            className="w-full text-right px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                          >
                            <div className="font-semibold text-gray-800">
                              {supplier.name}
                            </div>

                            {supplier.phone && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {supplier.phone}
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500">
                          لا يوجد مورد مطابق.
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setShowSupplierModal(true)
                        }
                        className="w-full px-4 py-3 text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center justify-center gap-2 font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        إضافة مورد جديد
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Warehouse */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  مخزن الاستلام{' '}
                  <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                  <Store className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                  <select
                    value={warehouseId}
                    onChange={e =>
                      setWarehouseId(e.target.value)
                    }
                    className="w-full pl-4 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                  >
                    <option value="">
                      اختر المخزن...
                    </option>

                    {warehouses
                      ?.filter(w => w.isActive)
                      .map(warehouse => (
                        <option
                          key={warehouse.id}
                          value={warehouse.id}
                        >
                          {warehouse.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ==========================================
              Items
          ========================================== */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">

            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <Box className="w-5 h-5 text-blue-600" />
              الأصناف
            </h2>

            {/* Product Smart Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />

                <input
                  type="text"
                  placeholder="ابحث باسم المنتج، SKU أو الباركود..."
                  value={productSearch}
                  onChange={e =>
                    setProductSearch(e.target.value)
                  }
                  className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              {productSearch && (
                <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">

                  {searchResults.length > 0 ? (
                    searchResults.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() =>
                          handleAddProduct(product)
                        }
                        className="w-full text-right px-4 py-3 hover:bg-blue-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">
                            {product.name}
                          </p>

                          {(product.sku ||
                            product.barcode) && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {product.sku || ''}
                              {product.barcode
                                ? ` | ${product.barcode}`
                                : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                          <Plus className="w-4 h-4" />
                          إضافة
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-center text-gray-500 text-sm">
                      لا توجد منتجات مطابقة للبحث.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setShowProductModal(true)
                    }
                    className="w-full px-4 py-3 text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center justify-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة منتج جديد
                  </button>
                </div>
              )}
            </div>

            {/* Items */}
            {items.length > 0 ? (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={item.lineId}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
                  >
                    <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 bg-gray-50/50">

                      <div className="flex-1">
                        <span className="font-medium text-gray-900 block">
                          {index + 1}. {item.productName}
                        </span>
                      </div>

                      <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">

                        {/* Quantity */}
                        <div className="w-24 shrink-0 space-y-1">
                          <label className="text-xs text-gray-500 md:hidden">
                            الكمية
                          </label>

                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={item.quantity}
                            onChange={e =>
                              handleUpdateItem(
                                item.lineId,
                                'quantity',
                                e.target.value === ''
                                  ? ''
                                  : parseFloat(
                                      e.target.value
                                    )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-sm"
                          />
                        </div>

                        {/* Purchase Price */}
                        <div className="w-28 shrink-0 space-y-1">
                          <label className="text-xs text-gray-500 md:hidden">
                            سعر الشراء
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.purchasePrice}
                            onChange={e =>
                              handleUpdateItem(
                                item.lineId,
                                'purchasePrice',
                                e.target.value === ''
                                  ? ''
                                  : parseFloat(
                                      e.target.value
                                    )
                              )
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-sm"
                          />
                        </div>

                        {/* Gross Total */}
                        <div className="w-28 shrink-0 text-left space-y-1">
                          <label className="text-xs text-gray-500 md:hidden block">
                            الإجمالي
                          </label>

                          <span className="font-bold text-gray-900 block py-1.5">
                            {item.grossLineTotal.toLocaleString()}
                            {' '}ج.م
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 md:border-r md:border-gray-200 md:pr-3">

                          <button
                            type="button"
                            onClick={() =>
                              togglePricingLine(
                                item.lineId
                              )
                            }
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 bg-blue-50 rounded"
                            title="تحديث أسعار البيع"
                          >
                            <Tag className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveItem(
                                item.lineId
                              )
                            }
                            className="text-red-500 hover:text-red-700 transition-colors p-1.5 bg-red-50 rounded"
                            title="حذف الصنف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pricing */}
                    {expandedPricingLines[item.lineId] && (
                      <div className="p-4 border-t border-gray-100 bg-white grid grid-cols-2 md:grid-cols-4 gap-3">

                        {[
                          ['sellPrice1', 'سعر البيع 1'],
                          ['sellPrice2', 'سعر البيع 2'],
                          ['sellPrice3', 'سعر البيع 3'],
                          ['sellPrice4', 'سعر البيع 4']
                        ].map(([field, label]) => (
                          <div
                            key={field}
                            className="space-y-1"
                          >
                            <label className="text-xs text-gray-500">
                              {label}
                            </label>

                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={
                                item[
                                  field as keyof InvoiceItem
                                ] ?? ''
                              }
                              onChange={e => {
                                const value =
                                  e.target.value === ''
                                    ? undefined
                                    : parseFloat(
                                        e.target.value
                                      );

                                handleUpdateItem(
                                  item.lineId,
                                  field as keyof InvoiceItem,
                                  value as never
                                );
                              }}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <Box className="w-10 h-10 text-gray-300 mx-auto mb-2" />

                <p className="text-gray-500 font-medium">
                  لم يتم إضافة أي أصناف بعد.
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  استخدم شريط البحث أعلاه لإضافة المنتجات
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ==========================================
            Sidebar
        ========================================== */}
        <div className="space-y-6">

          {/* Summary */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-3">
              ملخص الحساب
            </h2>

            <div className="space-y-3 text-sm">

              <div className="flex justify-between items-center text-gray-600">
                <span>إجمالي الأصناف:</span>
                <span className="font-semibold text-gray-800">
                  {subtotal.toLocaleString()} ج.م
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">
                  الخصم (-):
                </span>

                <div className="w-1/3">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discount}
                    onChange={e =>
                      setDiscount(
                        e.target.value === ''
                          ? ''
                          : parseFloat(
                              e.target.value
                            )
                      )
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded text-left focus:outline-none focus:ring-1 focus:ring-blue-500 text-red-600 font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">
                  مصاريف نقل/اقتناء (+):
                </span>

                <div className="w-1/3">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={additionalCharges}
                    onChange={e =>
                      setAdditionalCharges(
                        e.target.value === ''
                          ? ''
                          : parseFloat(
                              e.target.value
                            )
                      )
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded text-left focus:outline-none focus:ring-1 focus:ring-blue-500 text-orange-600 font-medium"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">
                  الصافي المطلوب:
                </span>

                <span className="font-black text-xl text-blue-600">
                  {totalAmount.toLocaleString()} ج.م
                </span>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">

            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b pb-3">
              <CreditCard className="w-5 h-5 text-blue-600" />
              الدفع والتسوية
            </h2>

            <div className="space-y-4">

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  طريقة الدفع
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    ['cash', 'credit', 'partial'] as const
                  ).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() =>
                        setPaymentMethod(method)
                      }
                      className={`py-2 text-sm font-medium rounded-lg border transition-all ${
                        paymentMethod === method
                          ? 'bg-blue-50 border-blue-600 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {method === 'cash'
                        ? 'نقدي'
                        : method === 'credit'
                        ? 'آجل'
                        : 'جزئي'}
                    </button>
                  ))}
                </div>
              </div>

              {(paymentMethod === 'cash' ||
                paymentMethod === 'partial') && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    خزينة السداد{' '}
                    <span className="text-red-500">*</span>
                  </label>

                  <select
                    value={cashboxId}
                    onChange={e =>
                      setCashboxId(e.target.value)
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      اختر الخزنة...
                    </option>

                    {cashboxes
                      ?.filter(c => c.isActive)
                      .map(cashbox => (
                        <option
                          key={cashbox.id}
                          value={cashbox.id}
                        >
                          {cashbox.name} (
                          {cashbox.balance.toLocaleString()}
                          )
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {paymentMethod === 'partial' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    المبلغ المدفوع{' '}
                    <span className="text-red-500">*</span>
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={paidAmount}
                    onChange={e =>
                      setPaidAmount(
                        e.target.value === ''
                          ? ''
                          : parseFloat(
                              e.target.value
                            )
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold text-blue-700"
                  />
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center mt-4">
                <span className="text-sm font-medium text-gray-600">
                  المتبقي (آجل):
                </span>

                <span
                  className={`font-bold ${
                    remainingAmount > 0
                      ? 'text-orange-600'
                      : 'text-gray-900'
                  }`}
                >
                  {remainingAmount.toLocaleString()} ج.م
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          Floating Action Bar
      ========================================== */}
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
              items.length === 0
            }
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 min-w-[200px] justify-center"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                حفظ الفاتورة
              </>
            )}
          </button>
        </div>
      </div>

      {/* ==========================================
          Supplier Modal
      ========================================== */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-800">
                إضافة مورد جديد
              </h3>

              <button
                type="button"
                onClick={() =>
                  setShowSupplierModal(false)
                }
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">

              <input
                type="text"
                value={newSupplierName}
                onChange={e =>
                  setNewSupplierName(e.target.value)
                }
                placeholder="اسم المورد *"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                value={newSupplierPhone}
                onChange={e =>
                  setNewSupplierPhone(e.target.value)
                }
                placeholder="رقم الهاتف"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                value={newSupplierAddress}
                onChange={e =>
                  setNewSupplierAddress(e.target.value)
                }
                placeholder="العنوان"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setShowSupplierModal(false)
                  }
                  className="px-5 py-2 bg-gray-100 rounded-lg"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  onClick={handleCreateSupplier}
                  disabled={isSupplierLoading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {isSupplierLoading
                    ? 'جاري الحفظ...'
                    : 'إضافة المورد'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Product Modal
      ========================================== */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8">

            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-800">
                إضافة منتج جديد
              </h3>

              <button
                type="button"
                onClick={() =>
                  setShowProductModal(false)
                }
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">

              <input
                type="text"
                value={newProductName}
                onChange={e =>
                  setNewProductName(e.target.value)
                }
                placeholder="اسم المنتج *"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Category */}
              <div className="space-y-2">

                <label className="text-sm font-medium text-gray-700">
                  التصنيف *
                </label>

                <input
                  type="text"
                  value={categorySearch}
                  onChange={e => {
                    setCategorySearch(e.target.value);
                    setNewProductCategoryId('');
                  }}
                  placeholder="ابحث عن التصنيف..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {categorySearch && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">

                    {categoryResults.map(category => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setNewProductCategoryId(
                            category.id
                          );
                          setCategorySearch(
                            category.name
                          );
                        }}
                        className="w-full text-right px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                      >
                        {category.name}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setShowNewCategoryInput(
                          true
                        )
                      }
                      className="w-full px-4 py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة تصنيف جديد
                    </button>
                  </div>
                )}

                {showNewCategoryInput && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">

                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={e =>
                        setNewCategoryName(
                          e.target.value
                        )
                      }
                      placeholder="اسم التصنيف الجديد"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />

                    <input
                      type="text"
                      value={newCategoryDescription}
                      onChange={e =>
                        setNewCategoryDescription(
                          e.target.value
                        )
                      }
                      placeholder="وصف التصنيف - اختياري"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setShowNewCategoryInput(
                            false
                          )
                        }
                        className="px-4 py-2 bg-gray-200 rounded-lg"
                      >
                        إلغاء
                      </button>

                      <button
                        type="button"
                        onClick={
                          handleCreateCategory
                        }
                        disabled={
                          isCategoryLoading
                        }
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                      >
                        {isCategoryLoading
                          ? 'جاري الإضافة...'
                          : 'إضافة التصنيف'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <input
                  type="text"
                  value={newProductSku}
                  onChange={e =>
                    setNewProductSku(e.target.value)
                  }
                  placeholder="SKU - اختياري"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="text"
                  value={newProductBarcode}
                  onChange={e =>
                    setNewProductBarcode(
                      e.target.value
                    )
                  }
                  placeholder="الباركود - اختياري"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newProductPrice1}
                  onChange={e =>
                    setNewProductPrice1(
                      e.target.value === ''
                        ? ''
                        : parseFloat(
                            e.target.value
                          )
                    )
                  }
                  placeholder="سعر البيع 1"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newProductPrice2}
                  onChange={e =>
                    setNewProductPrice2(
                      e.target.value === ''
                        ? ''
                        : parseFloat(
                            e.target.value
                          )
                    )
                  }
                  placeholder="سعر البيع 2"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newProductPrice3}
                  onChange={e =>
                    setNewProductPrice3(
                      e.target.value === ''
                        ? ''
                        : parseFloat(
                            e.target.value
                          )
                    )
                  }
                  placeholder="سعر البيع 3"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newProductPrice4}
                  onChange={e =>
                    setNewProductPrice4(
                      e.target.value === ''
                        ? ''
                        : parseFloat(
                            e.target.value
                          )
                    )
                  }
                  placeholder="سعر البيع 4"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newProductReorderLevel}
                  onChange={e =>
                    setNewProductReorderLevel(
                      e.target.value === ''
                        ? ''
                        : parseFloat(
                            e.target.value
                          )
                    )
                  }
                  placeholder="حد إعادة الطلب"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">

                <button
                  type="button"
                  onClick={() =>
                    setShowProductModal(false)
                  }
                  className="px-5 py-2 bg-gray-100 rounded-lg"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  onClick={handleCreateProduct}
                  disabled={isProductLoading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {isProductLoading
                    ? 'جاري الحفظ...'
                    : 'إضافة المنتج وإدراجه'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewPurchaseInvoice;

مهم قبل الاستبدال: أنا تعمدت هنا عدم تعديل أي Store أو Service آخر. بعد استبدال الملف، اعمل TypeScript/build check فقط. لو ظهر أي خطأ، ابعته لي كما هو قبل ما ننتقل للملف التالي؛ خصوصًا لأن شكل "CreateSupplierParams" و"ProductInput" الفعليين لم ترسل ملفي الـService الخاصين بهما.
