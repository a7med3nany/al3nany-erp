import { collection, getDocs, doc, setDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';

const PRODUCTS_COLLECTION = 'products';

// دالة مساعدة للتحقق من عدم تكرار SKU أو الباركود
const checkUniqueness = async (field: 'sku' | 'barcode', value: string | undefined, excludeId?: string) => {
  if (!value || value.trim() === '') return;
  
  const valueTrimmed = value.trim();
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where(field, '==', valueTrimmed),
    where('isDeleted', '==', false)
  );
  
  const snapshot = await getDocs(q);
  const duplicates = snapshot.docs.filter(doc => doc.id !== excludeId);
  
  if (duplicates.length > 0) {
    const fieldName = field === 'sku' ? 'كود الصنف (SKU)' : 'الباركود';
    throw new Error(`القيمة المدخلة في ${fieldName} مسجلة لمنتج آخر. يرجى إدخال قيمة فريدة.`);
  }
};

export const getProducts = async (): Promise<Product[]> => {
  // جلب المنتجات غير المحذوفة فقط
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('isDeleted', '==', false)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Product;
  });
};

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>;

export const createProduct = async (data: ProductInput): Promise<Product> => {
  // التحقق من التفرد
  await checkUniqueness('sku', data.sku);
  await checkUniqueness('barcode', data.barcode);

  const productRef = doc(collection(db, PRODUCTS_COLLECTION));
  const now = Timestamp.now();
  
  const newProduct: Omit<Product, 'id'> = {
    categoryId: data.categoryId,
    name: data.name.trim(),
    sku: data.sku?.trim() || "",
    barcode: data.barcode?.trim() || "",
    price1: data.price1,
    price2: data.price2,
    price3: data.price3,
    price4: data.price4,
    reorderLevel: data.reorderLevel,
    isActive: data.isActive,
    isDeleted: false,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  await setDoc(productRef, newProduct);

  return {
    id: productRef.id,
    ...newProduct,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };
};

export const updateProduct = async (id: string, data: ProductInput): Promise<void> => {
  // التحقق من التفرد مع استثناء المنتج الحالي
  await checkUniqueness('sku', data.sku, id);
  await checkUniqueness('barcode', data.barcode, id);

  const productRef = doc(db, PRODUCTS_COLLECTION, id);
  
  await updateDoc(productRef, {
    categoryId: data.categoryId,
    name: data.name.trim(),
    sku: data.sku?.trim() || "",
    barcode: data.barcode?.trim() || "",
    price1: data.price1,
    price2: data.price2,
    price3: data.price3,
    price4: data.price4,
    reorderLevel: data.reorderLevel,
    isActive: data.isActive,
    updatedAt: Timestamp.now(),
  });
};

export const softDeleteProduct = async (id: string): Promise<void> => {
  // ملاحظة: سيتم إضافة فحص مستقبلي هنا لمنع حذف المنتج إذا كان له حركات مخزنية أو فواتير
  // حالياً ننفذ الـ Soft Delete المباشر
  const productRef = doc(db, PRODUCTS_COLLECTION, id);
  await updateDoc(productRef, {
    isDeleted: true,
    updatedAt: Timestamp.now(),
  });
};
