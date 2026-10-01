import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * دالة مساعدة لدمج فئات Tailwind CSS
 * تعتمد عليها مكتبة shadcn/ui لمنع تعارض التنسيقات (Class Conflicts)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

