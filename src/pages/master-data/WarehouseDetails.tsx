import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowRight, 
  Package, 
  Boxes, 
  Calculator, 
  AlertCircle, 
  Search, 
  Filter, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  MapPin
} from "lucide-react";

import { useInventoryStore } from "../../store/inventoryStore";
import { useWarehouseStore } from "../../store/warehouseStore";
import { useProductStore } from "../../store/productStore";
import { useCategoryStore } from "../../store/categoryStore";

export default function WarehouseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // 1. استدعاء المتاجر
  const { items: inventoryItems, isLoading: isInventoryLoading, error: inventoryError, loadWarehouseStock, clear: clearInventory } = useInventoryStore();
  const { warehouses, fetchWarehouses } = useWarehouseStore();
  const { products, fetchProducts } = useProductStore();
  const { categories, fetchCategories } = useCategoryStore();

  // 2. حالة الفلاتر المحلية
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  // 3. جلب البيانات عند فتح الصفحة
  useEffect(() => {
    if (!id) return;
    
    // جلب بيانات المخزون للمخزن الحالي
    loadWarehouseStock(id);

    // جلب البيانات الأساسية إذا لم تكن محملة مسبقاً
    if (warehouses.length === 0) fetchWarehouses();
    if (products.length === 0) fetchProducts();
    if (categories.length === 0) fetchCategories();

    // تنظيف المخزون من الذاكرة عند الخروج من الصفحة
    return () => clearInventory();
  }, [id, loadWarehouseStock, clearInventory, warehouses.length, products.length, categories.length, fetchWarehouses, fetchProducts, fetchCategories]);

  // 4. استخراج بيانات المخزن الحالي
  const currentWarehouse = useMemo(() => warehouses.find(w => w.id === id), [warehouses, id]);

  // 5. دمج البيانات محلياً (Local Join)
  const enrichedItems = useMemo(() => {
    return inventoryItems.map(invItem => {
      const product = products.find(p => p.id === invItem.productId);
      const category = categories.find(c => c.id === product?.categoryId);
      
      return {
        ...invItem,
        productName: product?.name || 'منتج غير معروف',
        sku: product?.sku || '',
        barcode: product?.barcode || '',
        categoryId: product?.categoryId || '',
        categoryName: category?.name || 'بدون فئة',
        price1: product?.price1 || 0,
        price2: product?.price2 || 0,
        price3: product?.price3 || 0,
        price4: product?.price4 || 0,
      };
    });
  }, [inventoryItems, products, categories]);

  // 6. حسابات إحصائيات المخزن
  const summary = useMemo(() => {
    let totalQty = 0;
    let totalVal = 0;
    
    enrichedItems.forEach(item => {
      totalQty += item.quantity;
      totalVal += item.inventoryValue;
    });

    return {
      totalSKUs: enrichedItems.length,
      totalQuantity: totalQty,
      totalValue: totalVal
    };
  }, [enrichedItems]);

  // 7. تطبيق الفلاتر على القائمة المدمجة
  const filteredItems = useMemo(() => {
    return enrichedItems.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        item.productName.toLowerCase().includes(searchLower) ||
        item.sku.toLowerCase().includes(searchLower) ||
        item.barcode.toLowerCase().includes(searchLower);
      
      const matchCategory = filterCategory ? item.categoryId === filterCategory : true;
      
      return matchSearch && matchCategory;
    });
  }, [enrichedItems, searchTerm, filterCategory]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ar-EG').format(num);
  };

  // --- حالات التحميل والخطأ والمخزن غير الموجود ---
  if (!id) {
    return <div className="p-6 text-center text-destructive">معرف المخزن مفقود</div>;
  }

  if (!currentWarehouse && warehouses.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border border-border shadow-sm animate-in fade-in">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">المخزن غير موجود</h2>
        <p className="text-muted-foreground mb-6">لم يتم العثور على المخزن المطلوب، ربما تم حذفه أو أن الرابط غير صحيح.</p>
        <button onClick={() => navigate('/warehouses')} className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium transition-colors">
          العودة لقائمة المخازن
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* 1. Header (رأس الصفحة) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div className="flex items-start gap-4">
          <button 
            onClick={() => navigate('/warehouses')} 
            className="mt-1 p-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full transition-colors shrink-0"
            title="العودة"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                <StoreIcon /> {currentWarehouse?.name || 'جاري التحميل...'}
              </h1>
              {currentWarehouse?.isActive ? (
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> نشط
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <XCircle className="h-3.5 w-3.5" /> معطل
                </span>
              )}
            </div>
            {currentWarehouse?.location && (
              <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {currentWarehouse.location}
              </p>
            )}
          </div>
        </div>
      </div>

      {inventoryError && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{inventoryError}</p>
        </div>
      )}

      {/* 2. Summary Cards (البطاقات الإحصائية) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">إجمالي الأصناف (SKUs)</p>
            <h3 className="text-2xl font-bold text-foreground font-mono">{formatNumber(summary.totalSKUs)}</h3>
          </div>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">إجمالي الكميات</p>
            <h3 className="text-2xl font-bold text-foreground font-mono">{formatNumber(summary.totalQuantity)}</h3>
          </div>
        </div>

        <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">قيمة المخزون (بالتكلفة)</p>
            <h3 className="text-2xl font-bold text-foreground font-mono">{formatCurrency(summary.totalValue)}</h3>
          </div>
        </div>
      </div>

      {/* 3. Filters (الفلاتر) */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter className="h-5 w-5" /> تصفية أرصدة المخزن
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="بحث باسم المنتج، الباركود، أو كود الصنف..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-3 pr-9 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" 
            />
          </div>
          <select 
            value={filterCategory} 
            onChange={e => setFilterCategory(e.target.value)} 
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          >
            <option value="">جميع الفئات</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Inventory Table (جدول أرصدة المخزون) */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isInventoryLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل الأرصدة...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">اسم المنتج والفئة</th>
                  <th className="px-4 py-4 font-semibold text-center whitespace-nowrap">الرصيد الفعلي</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">متوسط التكلفة (WAC)</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">إجمالي التكلفة</th>
                  <th className="px-4 py-4 font-semibold whitespace-nowrap">أسعار البيع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 min-w-[200px]">
                      <p className="font-bold text-foreground">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{item.categoryName}</span>
                        {item.sku && <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono font-bold text-base bg-primary/10 text-primary px-3 py-1 rounded-lg">
                        {formatNumber(item.quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-muted-foreground">
                      {formatCurrency(item.wac)}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-foreground">
                      {formatCurrency(item.inventoryValue)}
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono" dir="ltr">
                        <span className="text-right" title="السعر 1 (الأساسي)">{formatCurrency(item.price1)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 2">{formatCurrency(item.price2)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 3">{formatCurrency(item.price3)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 4">{formatCurrency(item.price4)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {/* حالات الفراغ وعدم وجود نتائج */}
                {filteredItems.length === 0 && !isInventoryLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                      {inventoryItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <Package className="h-10 w-10 text-muted-foreground/50" />
                          <p className="text-lg font-medium">المخزن فارغ تماماً</p>
                          <p className="text-sm">لم يتم تسجيل أي بضاعة أو أرصدة افتتاحية في هذا المخزن بعد.</p>
                        </div>
                      ) : (
                        <p>لا توجد منتجات مطابقة لخيارات البحث الحالية.</p>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// مكون أيقونة مساعد
function StoreIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>;
}
