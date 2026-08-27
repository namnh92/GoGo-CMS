import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: {
      // Dev only. Production terminates /v1 at the same origin as the CMS.
      '/v1': {
        target: process.env.VITE_API_ORIGIN ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
