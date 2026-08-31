import type { TLSSocket } from 'node:tls'
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
        // DEV is a deployed environment, not something each developer stands
        // up (GoGo-Infra INF-038). Point this elsewhere only to debug GoGo-BE
        // itself, and know it is a different database.
        target: process.env.VITE_API_ORIGIN ?? 'https://api-dev.gogo.id.vn',
        changeOrigin: true,
        configure(proxy) {
          // The dev API is served over TLS, so it sets the session cookie
          // `Secure`. This dev server is plain http on localhost, where a
          // browser drops a Secure cookie without a word — login would appear
          // to succeed and every later request would come back 401.
          //
          // Stripped only for http, so pointing VITE_API_ORIGIN at an https
          // dev server keeps the flag the API asked for.
          proxy.on('proxyRes', (proxyRes, req) => {
            const setCookie = proxyRes.headers['set-cookie']
            if (!setCookie || (req.socket as TLSSocket).encrypted) return
            proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
              cookie.replace(/;\s*Secure/gi, ''),
            )
          })
        },
      },
    },
  },
})
