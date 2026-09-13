import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// In development the dev server proxies the API and the Mercure hub so the browser
// only ever talks to one origin (same as nginx does in production).
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: false },
      '/.well-known/mercure': { target: apiProxyTarget, changeOrigin: false },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
