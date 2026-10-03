/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Diary',
        short_name: 'Diary',
        start_url: '/',
        display: 'standalone',
        background_color: '#fbfaf7',
        theme_color: '#fbfaf7',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // The app shell is precached and served as '/', not '/index.html': hosts such as Cloudflare redirect /index.html
        // to /, and Safari refuses a page the service worker serves from a redirected response.
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        manifestTransforms: [async (entries) => ({ manifest: entries.map((e) => (e.url === 'index.html' ? { ...e, url: '/' } : e)), warnings: [] })],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
