import { collection, doc, getDocs, setDoc, addDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Warehouse } from '../types';

const COLLECTION_NAME = 'warehouses';
// استخدام معرّف ثابت للمخزن الرئيسي لمنع تكراره نهائياً في حالة تشغيل النظام من عدة أجهزة في نفس الوقت
const MAIN_WAREHOUSE_ID = 'main_warehouse'; 

// 1. تهيئة المخزن الرئيسي (يتم استدعاؤها عند تشغيل النظام)
export const initializeMainWarehouse = async (): Promise<void> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('isMain', '==', true));
    const snapshot = await getDocs(q);

    // إذا لم يكن هناك أي مخزن رئيسي، نقوم بإنشائه فوراً
    if (snapshot.empty) {
      const mainWarehouseData = {
        name: 'المخزن الرئيسي',
        location: 'المقر الرئيسي',
        isMain: true,
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      // نستخدم setDoc مع المعرف الثابت بدلاً من addDoc لضمان التفرّد
      await setDoc(doc(db, COLLECTION_NAME, MAIN_WAREHOUSE_ID), mainWarehouseData);
      console.log('تم إنشاء المخزن الرئيسي بنجاح.');
    }
  } catch (error) {
    console.error('خطأ أثناء تهيئة المخزن الرئيسي:', error);
    throw error;
  }
};

// 2. جلب جميع المخازن
export const getWarehouses = async (): Promise<Warehouse[]> => {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        location: data.location || '',
        isMain: data.isMain,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Warehouse;
    });
  } catch (error) {
    console.error('خطأ أثناء جلب المخازن:', error);
    throw error;
  }
};

// 3. إضافة مخزن فرعي جديد
// لا نسمح بتمرير isMain، النظام يجبر المخازن الجديدة على أن تكون فرعية (isMain: false)
export const addWarehouse = async (data: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt' | 'isMain'>): Promise<string> => {
  try {
    const newWarehouse = {
      ...data,
      isMain: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), newWarehouse);
    return docRef.id;
  } catch (error) {
    console.error('خطأ أثناء إضافة مخزن جديد:', error);
    throw error;
  }
};

// 4. تحديث بيانات المخزن
export const updateWarehouse = async (id: string, data: Partial<Omit<Warehouse, 'id' | 'createdAt' | 'isMain'>>): Promise<void> => {
  try {
    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    // حماية محاسبية صارمة: إذا كان التعديل يستهدف المخزن الرئيسي، نمنع تعطيله إجبارياً
    if (id === MAIN_WAREHOUSE_ID) {
      updateData.isActive = true;
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('خطأ أثناء تحديث المخزن:', error);
    throw error;
  }
};
