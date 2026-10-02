import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Edit, Trash2, Package, X, CheckCircle2, XCircle, AlertCircle, Search, Filter } from "lucide-react";
import { useProductStore } from "../../store/productStore";
import { useCategoryStore } from "../../store/categoryStore";
import { Product } from "../../types";

// مخطط التحقق (Zod Schema)
const productSchema = z.object({
  name: z.string().min(2, { message: "اسم المنتج مطلوب (حرفين على الأقل)" }).trim(),
  categoryId: z.string().min(1, { message: "يرجى اختيار الفئة" }),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price1: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  price2: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  price3: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  price4: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  reorderLevel: z.coerce.number().min(0, "حد الطلب يجب أن يكون 0 أو أكثر"),
  isActive: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function Products() {
  const { products, isLoading: isProductsLoading, error: productsError, fetchProducts, addProduct, editProduct, removeProduct } = useProductStore();
  const { categories, isLoading: isCategoriesLoading, fetchCategories } = useCategoryStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // حالة الفلاتر
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      isActive: true, price1: 0, price2: 0, price3: 0, price4: 0, reorderLevel: 0,
      sku: "", barcode: ""
    },
  });

  // جلب البيانات عند فتح الشاشة
  useEffect(() => {
    fetchProducts();
    if (categories.length === 0) fetchCategories();
  }, [fetchProducts, fetchCategories, categories.length]);

  // فلترة المنتجات وعرض أسماء الفئات محلياً (Derived State)
  const filteredProducts = useMemo(() => {
    return products.map(prod => {
      const category = categories.find(c => c.id === prod.categoryId);
      return {
        ...prod,
        categoryName: category ? category.name : "بدون فئة"
      };
    }).filter(prod => {
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        prod.name.toLowerCase().includes(searchLower) ||
        (prod.sku && prod.sku.toLowerCase().includes(searchLower)) ||
        (prod.barcode && prod.barcode.toLowerCase().includes(searchLower));
      
      const matchCategory = filterCategory ? prod.categoryId === filterCategory : true;
      const matchStatus = filterStatus ? (filterStatus === 'active' ? prod.isActive : !prod.isActive) : true;
      
      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, categories, searchTerm, filterCategory, filterStatus]);

  const handleOpenAdd = () => {
    setSelectedProductId(null);
    setActionError(null);
    reset({
      name: "", categoryId: "", sku: "", barcode: "",
      price1: 0, price2: 0, price3: 0, price4: 0, reorderLevel: 0, isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setSelectedProductId(product.id);
    setActionError(null);
    reset({
      name: product.name,
      categoryId: product.categoryId,
      sku: product.sku || "",
      barcode: product.barcode || "",
      price1: product.price1,
      price2: product.price2,
      price3: product.price3,
      price4: product.price4,
      reorderLevel: product.reorderLevel,
      isActive: product.isActive,
    });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (id: string) => {
    setSelectedProductId(id);
    setActionError(null);
    setIsDeleteModalOpen(true);
  };

  const onSubmit = async (data: ProductFormValues) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (selectedProductId) {
        await editProduct(selectedProductId, data);
      } else {
        await addProduct(data);
      }
      setIsModalOpen(false);
      reset();
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedProductId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await removeProduct(selectedProductId);
      setIsDeleteModalOpen(false);
      setSelectedProductId(null);
    } catch (err: any) {
      setActionError(err.message || 'حدث خطأ أثناء محاولة الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(price);
  };

  const isLoading = isProductsLoading || isCategoriesLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Package className="h-6 w-6" /> إدارة المنتجات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة قائمة الأصناف، الأسعار، وأكواد المنتجات (كتالوج المنتجات).
          </p>
        </div>
        <button onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-sm">
          <Plus className="h-5 w-5" /> إضافة منتج
        </button>
      </div>

      {productsError && !isModalOpen && !isDeleteModalOpen && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{productsError}</p>
        </div>
      )}

      {/* 2. Filters */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter className="h-5 w-5" /> فلاتر البحث
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="بحث بالاسم، الباركود، أو SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-3 pr-9 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary text-sm" />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
            <option value="">كل الفئات</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">معطل</option>
          </select>
        </div>
      </div>

      {/* 3. Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
            <p>جاري تحميل المنتجات...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-secondary-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-4 font-semibold">اسم المنتج والفئة</th>
                  <th className="px-4 py-4 font-semibold">الأكواد (SKU/Barcode)</th>
                  <th className="px-4 py-4 font-semibold">أسعار البيع</th>
                  <th className="px-4 py-4 font-semibold text-center">حد الطلب</th>
                  <th className="px-4 py-4 font-semibold">الحالة</th>
                  <th className="px-4 py-4 font-semibold w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-foreground">{prod.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{prod.categoryName}</p>
                    </td>
                    <td className="px-4 py-3">
                      {prod.sku && <p className="text-xs font-mono text-muted-foreground"><span className="font-semibold text-foreground">SKU:</span> {prod.sku}</p>}
                      {prod.barcode && <p className="text-xs font-mono text-muted-foreground"><span className="font-semibold text-foreground">Bar:</span> {prod.barcode}</p>}
                      {!prod.sku && !prod.barcode && <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs font-mono" dir="ltr">
                        <span className="text-right" title="السعر 1">{formatPrice(prod.price1)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 2">{formatPrice(prod.price2)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 3">{formatPrice(prod.price3)}</span>
                        <span className="text-right text-muted-foreground" title="السعر 4">{formatPrice(prod.price4)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">{prod.reorderLevel}</span>
                    </td>
                    <td className="px-4 py-3">
                      {prod.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-bold border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded-md text-xs font-bold border border-rose-200">
                          <XCircle className="h-3 w-3" /> معطل
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenEdit(prod)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors" title="تعديل">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleOpenDelete(prod.id)} className="text-destructive hover:text-destructive/80 bg-destructive/10 hover:bg-destructive/20 p-1.5 rounded transition-colors" title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      لا توجد منتجات مطابقة للبحث أو لم يتم إضافة منتجات بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Modal إضافة/تعديل */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-2xl rounded-xl shadow-xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30 shrink-0">
              <h2 className="text-lg font-bold text-foreground">
                {selectedProductId ? "تعديل منتج" : "إضافة منتج جديد"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-6">
              <form id="productForm" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {actionError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{actionError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* البيانات الأساسية */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-bold text-foreground">اسم المنتج <span className="text-destructive">*</span></label>
                    <input type="text" {...register("name")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary" placeholder="مثال: آيفون 15 برو، سماعة أنكر..." />
                    {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">الفئة <span className="text-destructive">*</span></label>
                    <select {...register("categoryId")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary">
                      <option value="">اختر الفئة...</option>
                      {categories.filter(c => c.isActive || c.id === categories.find(cat => cat.id === selectedProductId)?.id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {errors.categoryId && <p className="text-destructive text-xs">{errors.categoryId.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">حد إعادة الطلب (Reorder Level)</label>
                    <input type="number" min="0" {...register("reorderLevel")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono" placeholder="0" />
                    {errors.reorderLevel && <p className="text-destructive text-xs">{errors.reorderLevel.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">كود داخلي (SKU)</label>
                    <input type="text" {...register("sku")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono" placeholder="كود فريد اختياري" dir="ltr" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">باركود (Barcode)</label>
                    <input type="text" {...register("barcode")} className="w-full px-3 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono" placeholder="رقم الباركود اختياري" dir="ltr" />
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                    <Wallet className="h-4 w-4" /> أسعار البيع (ج.م)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">سعر 1 (أساسي)</label>
                      <input type="number" step="0.01" min="0" {...register("price1")} className="w-full px-2 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono text-sm" placeholder="0.00" />
                      {errors.price1 && <p className="text-destructive text-xs">{errors.price1.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">سعر 2</label>
                      <input type="number" step="0.01" min="0" {...register("price2")} className="w-full px-2 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono text-sm" placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">سعر 3</label>
                      <input type="number" step="0.01" min="0" {...register("price3")} className="w-full px-2 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono text-sm" placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">سعر 4</label>
                      <input type="number" step="0.01" min="0" {...register("price4")} className="w-full px-2 py-2 bg-input border border-border rounded-md focus:ring-2 focus:ring-primary font-mono text-sm" placeholder="0.00" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border mt-4">
                  <input type="checkbox" id="isActive" {...register("isActive")} className="h-4 w-4 text-primary rounded border-border focus:ring-primary cursor-pointer" />
                  <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
                    منتج نشط (يظهر في المبيعات والمشتريات)
                  </label>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">إلغاء</button>
              <button form="productForm" type="submit" disabled={isSubmitting} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-2 rounded-md font-medium flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} حفظ المنتج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal تأكيد الحذف */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-foreground">هل أنت متأكد؟</h2>
              <p className="text-muted-foreground text-sm">
                سيتم إخفاء هذا المنتج من القوائم (حذف ناعم) للحفاظ على البيانات التاريخية للفواتير والمخزون.
              </p>
              
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-xs font-semibold mt-4 text-right">
                  {actionError}
                </div>
              )}
              
              <div className="flex gap-3 pt-4 mt-2">
                <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 rounded-md font-medium">تراجع</button>
                <button type="button" onClick={confirmDelete} disabled={isSubmitting} className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground py-2 rounded-md font-medium flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
