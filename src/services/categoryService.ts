import { collection, getDocs, doc, setDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Category } from '../types';

const CATEGORIES_COLLECTION = 'categories';
const PRODUCTS_COLLECTION = 'products'; // سنستخدمه للتحقق مستقبلاً

export const getCategories = async (): Promise<Category[]> => {
  // جلب الفئات غير المحذوفة فقط (Soft Delete pattern)
  const q = query(
    collection(db, CATEGORIES_COLLECTION),
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
    } as Category;
  });
};

export const createCategory = async (data: Pick<Category, 'name' | 'description' | 'isActive'>): Promise<Category> => {
  const nameTrimmed = data.name.trim();

  // التحقق من عدم وجود فئة بنفس الاسم (غير محذوفة)
  const q = query(
    collection(db, CATEGORIES_COLLECTION),
    where('name', '==', nameTrimmed),
    where('isDeleted', '==', false)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    throw new Error('يوجد فئة مسجلة بنفس الاسم بالفعل');
  }

  const categoryRef = doc(collection(db, CATEGORIES_COLLECTION));
  const now = Timestamp.now();
  
  const newCategory: Omit<Category, 'id'> = {
    name: nameTrimmed,
    description: data.description?.trim() || "",
    isActive: data.isActive,
    isDeleted: false,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
  };

  await setDoc(categoryRef, newCategory);

  return {
    id: categoryRef.id,
    ...newCategory,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };
};

export const updateCategory = async (
  id: string, 
  data: Pick<Category, 'name' | 'description' | 'isActive'>
): Promise<void> => {
  const nameTrimmed = data.name.trim();

  // التحقق من عدم وجود فئة أخرى بنفس الاسم (غير محذوفة)
  const q = query(
    collection(db, CATEGORIES_COLLECTION),
    where('name', '==', nameTrimmed),
    where('isDeleted', '==', false)
  );
  const snapshot = await getDocs(q);
  
  const duplicateDocs = snapshot.docs.filter(doc => doc.id !== id);
  if (duplicateDocs.length > 0) {
    throw new Error('يوجد فئة أخرى مسجلة بنفس الاسم');
  }

  const categoryRef = doc(db, CATEGORIES_COLLECTION, id);
  await updateDoc(categoryRef, {
    name: nameTrimmed,
    description: data.description?.trim() || "",
    isActive: data.isActive,
    updatedAt: Timestamp.now(),
  });
};

export const softDeleteCategory = async (id: string): Promise<void> => {
  // التحقق المعماري: منع حذف فئة إذا كان هناك منتجات غير محذوفة مرتبطة بها
  const productsQuery = query(
    collection(db, PRODUCTS_COLLECTION),
    where('categoryId', '==', id),
    where('isDeleted', '==', false)
  );
  const productsSnapshot = await getDocs(productsQuery);
  
  if (!productsSnapshot.empty) {
    throw new Error('لا يمكن حذف هذه الفئة لوجود منتجات فعالة مرتبطة بها. يرجى نقل المنتجات لفئة أخرى أو حذفها أولاً.');
  }

  const categoryRef = doc(db, CATEGORIES_COLLECTION, id);
  await updateDoc(categoryRef, {
    isDeleted: true,
    updatedAt: Timestamp.now(),
  });
};
