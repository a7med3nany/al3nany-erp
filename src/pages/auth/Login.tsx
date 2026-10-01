import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../config/firebase";
import { Loader2, Lock, Mail } from "lucide-react";

// تعريف شروط صحة البيانات (Validation Schema)
const loginSchema = z.object({
  email: z.string().email({ message: "يرجى إدخال بريد إلكتروني صحيح" }),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      // محاولة تسجيل الدخول عبر فايربيز
      await signInWithEmailAndPassword(auth, data.email, data.password);
      // في حال النجاح، متجر Zustand سيلتقط التغيير تلقائياً
    } catch (err: any) {
      console.error(err);
      setError("بيانات الدخول غير صحيحة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-8 animate-in fade-in zoom-in-95 duration-500">
        
        {/* رأس النموذج (Header) */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">العناني ERP</h1>
          <p className="text-muted-foreground text-sm">أدخل بيانات الاعتماد للوصول إلى النظام</p>
        </div>

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* حقل البريد الإلكتروني */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
              <input
                type="email"
                dir="ltr"
                {...register("email")}
                className="w-full pl-3 pr-10 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
                placeholder="admin@al3nany.com"
              />
            </div>
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>

          {/* حقل كلمة المرور */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
              <input
                type="password"
                dir="ltr"
                {...register("password")}
                className="w-full pl-3 pr-10 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
                placeholder="••••••••"
              />
            </div>
            {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
          </div>

          {/* رسالة الخطأ إن وجدت */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm text-center">
              {error}
            </div>
          )}

          {/* زر تسجيل الدخول */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                جاري التحقق...
              </>
            ) : (
              "تسجيل الدخول"
            )}
          </button>
        </form>
        
      </div>
    </div>
  );
}
