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
          // GoGo-BE#679 — single sign-on from a local dev server. The browser
          // here never passed Cloudflare Access, so the assertion is supplied
          // by the developer: `cloudflared access login <cms-dev URL>`, then
          // `CF_ACCESS_TOKEN=$(cloudflared access token -app=<cms-dev URL>)`.
          // Read from the server's environment and attached to the exchange
          // only — never a VITE_ variable, which Vite would inline into the
          // bundle.
          const accessToken = process.env.CF_ACCESS_TOKEN
          proxy.on('proxyReq', (proxyReq, req) => {
            if (
              accessToken &&
              req.method === 'POST' &&
              req.url?.split('?')[0] === '/v1/cms/auth/access-exchange'
            ) {
              proxyReq.setHeader('cf-access-jwt-assertion', accessToken)
            }
          })
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
