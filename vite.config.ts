import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  // مسار نسبي ليعمل على GitHub Pages وعلى Cloudflare دون أي تعديلات مستقبلية
  base: './', 
  resolve: {
    alias: {
      // الطريقة الحديثة والآمنة لتعريف المسارات بدلاً من __dirname التي تسبب انهيار النظام
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
