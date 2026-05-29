import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const getManualChunk = (id) => {
  if (id.includes('node_modules')) {
    if (id.includes('react')) return 'vendor-react'
    if (id.includes('@supabase')) return 'vendor-supabase'
    if (id.includes('lucide-react')) return 'vendor-lucide'
    if (id.includes('qrcode')) return 'vendor-qrcode'
    return 'vendor-misc'
  }

  if (id.includes('/src/payments/')) return 'payments'
  if (id.includes('/src/supabase/')) return 'supabase'
  return undefined
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('.', import.meta.url))
  const env = loadEnv(mode, envDir, '')
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          auth: fileURLToPath(new URL('./auth/index.html', import.meta.url)),
        },
        output: {
          manualChunks: getManualChunk,
        },
      },
    },
  }
})
