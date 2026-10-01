# Al3nany ERP - Project Specification

## 1. Project Overview
**System Name:** العناني ERP (Al3nany ERP)
**Business Type:** تجارة وتوزيع اكسسوارات المحمول (جملة وتجزئة).
**Owner:** أحمد بشير العناني.
**Objective:** بناء نظام ERP مالي وتشغيلي متكامل يربط بين المبيعات، المشتريات، المخازن، الخزائن، حسابات العملاء والموردين، إدارة الشركاء، وتقفيل اليومية بنزاهة مالية تامة.

## 2. Technology Stack
- **Frontend Framework:** React.js + Vite (Single Page Application).
- **Language:** TypeScript (Strict Mode).
- **Styling:** Tailwind CSS + shadcn/ui (RTL Support).
- **State Management:** Zustand (Global State) + React Query (Data Fetching & Caching).
- **Forms & Validation:** React Hook Form + Zod.
- **Backend & Database:** Firebase (Auth, Firestore, Storage).
- **Hosting:** Cloudflare Pages.

## 3. Core Architecture
- **Client-Side Processing:** الواجهة تدير العمليات الحسابية اللحظية وأكواد العرض الداخلية.
- **Service Layer:** كافة تفاعلات قاعدة البيانات معزولة في مجلد `services/`.
- **Atomic Operations:** تعتمد العمليات المالية بالكامل على `Firestore Transactions` لضمان عدم وجود بيانات غير مكتملة (Race Conditions).
- **Role-Based Access Control (RBAC):** نظام صلاحيات ديناميكي عبر Claims (Owner, Manager, Sales, etc.).
- **Security Rules:** حماية صارمة على مستوى السيرفر (Firestore Security Rules) تمنع أي تجاوز للواجهة الأمامية.
