import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// بيانات Firebase الخاصة بمشروع Al3nany ERP
const firebaseConfig = {
  apiKey: "AIzaSyBMCgGl2hOkfkvKSukxbQiB2EINzIEJ1Oo",
  authDomain: "al3nany-erp.firebaseapp.com",
  projectId: "al3nany-erp",
  storageBucket: "al3nany-erp.firebasestorage.app",
  messagingSenderId: "860465993629",
  appId: "1:860465993629:web:66f230c912165f60c04174",
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
