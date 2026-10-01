import { Outlet } from "react-router-dom";

export default function MainLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* القائمة الجانبية (Sidebar) - تظهر على يمين الشاشة في وضع RTL */}
      <aside className="hidden md:flex flex-col w-64 border-l border-border bg-card text-card-foreground shrink-0">
        <div className="h-16 flex items-center justify-center border-b border-border px-4">
          <h1 className="text-xl font-bold text-primary">العناني ERP</h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4">
          {/* سيتم إضافة روابط التنقل هنا في المراحل القادمة */}
          <p className="text-sm text-muted-foreground text-center mt-10">
            جاري بناء النظام...
          </p>
        </nav>
      </aside>

      {/* منطقة المحتوى الرئيسي (Main Content Area) */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* الشريط العلوي (Topbar) */}
        <header className="h-16 flex items-center justify-between border-b border-border bg-card px-6 shrink-0">
          <div className="text-lg font-semibold text-foreground">
            {/* سيتم ربط عنوان الصفحة ديناميكياً لاحقاً */}
            الرئيسية
          </div>
          <div className="flex items-center gap-4">
            {/* مكان لزر الملف الشخصي وتسجيل الخروج لاحقاً */}
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              أ
            </div>
          </div>
        </header>

        {/* مساحة عرض محتوى الصفحات الداخلية */}
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
