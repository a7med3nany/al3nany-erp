import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Cashbox } from '../types';

const COLLECTION_NAME = 'cashboxes';

// معرفات ثابتة للخزائن الأساسية لمنع تكرارها مهما حدث
const MAIN_CASHBOX_ID = 'main_cashbox';
const DAILY_CASHBOX_ID = 'daily_cashbox';

// 1. تهيئة الخزائن الافتراضية (الرئيسية وخزنة اليوم)
export const initializeDefaultCashboxes = async (): Promise<void> => {
  try {
    // التأكد من الخزنة الرئيسية
    const mainDocRef = doc(db, COLLECTION_NAME, MAIN_CASHBOX_ID);
    const mainDocSnap = await getDoc(mainDocRef);

    if (!mainDocSnap.exists()) {
      await setDoc(mainDocRef, {
        name: 'الخزينة الرئيسية',
        type: 'cash',
        isMain: true,
        isDaily: false,
        isActive: true,
        balance: 0, // الرصيد الابتدائي صفر (سيتم تغييره عبر الحركات المالية فقط)
        description: 'الخزينة النقدية الأساسية للشركة',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      console.log('تم إنشاء الخزينة الرئيسية بنجاح.');
    }

    // التأكد من خزنة رصيد اليوم
    const dailyDocRef = doc(db, COLLECTION_NAME, DAILY_CASHBOX_ID);
    const dailyDocSnap = await getDoc(dailyDocRef);

    if (!dailyDocSnap.exists()) {
      await setDoc(dailyDocRef, {
        name: 'خزينة رصيد اليوم',
        type: 'cash',
        isMain: false,
        isDaily: true,
        isActive: true,
        balance: 0, // الرصيد الابتدائي صفر
        description: 'تستقبل إيرادات ومصروفات الوردية الحالية قبل الترحيل والإغلاق',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      console.log('تم إنشاء خزينة رصيد اليوم بنجاح.');
    }
  } catch (error) {
    console.error('خطأ أثناء تهيئة الخزائن الافتراضية:', error);
    throw error;
  }
};

// 2. جلب جميع الخزائن النشطة والفرعية
export const getCashboxes = async (): Promise<Cashbox[]> => {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        type: data.type,
        isMain: data.isMain,
        isDaily: data.isDaily,
        isActive: data.isActive,
        balance: data.balance || 0,
        description: data.description || '',
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Cashbox;
    });
  } catch (error) {
    console.error('خطأ أثناء جلب الخزائن:', error);
    throw error;
  }
};

// 3. إضافة خزينة جديدة (حساب بنكي، محفظة، خزنة فرعية)
// لاحظ أننا نمنع تمرير الحقول الحساسة مثل الرصيد أو isMain أو isDaily
export const addCashbox = async (data: Omit<Cashbox, 'id' | 'createdAt' | 'updatedAt' | 'isMain' | 'isDaily' | 'balance'>): Promise<string> => {
  try {
    const newCashbox = {
      ...data,
      isMain: false,
      isDaily: false,
      balance: 0, // أي حساب جديد يبدأ برصيد صفر إجبارياً
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), newCashbox);
    return docRef.id;
  } catch (error) {
    console.error('خطأ أثناء إضافة خزينة جديدة:', error);
    throw error;
  }
};

// 4. تحديث بيانات الخزينة
// نمنع تحديث الرصيد من شاشة التعديل العادية، ونمنع التلاعب في أنواع الخزائن الأساسية
export const updateCashbox = async (id: string, data: Partial<Omit<Cashbox, 'id' | 'createdAt' | 'isMain' | 'isDaily' | 'balance'>>): Promise<void> => {
  try {
    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    // حماية محاسبية: الخزنة الرئيسية وخزنة رصيد اليوم لا يمكن تعطيلهما أبداً
    if (id === MAIN_CASHBOX_ID || id === DAILY_CASHBOX_ID) {
      updateData.isActive = true;
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('خطأ أثناء تحديث الخزينة:', error);
    throw error;
  }
};
