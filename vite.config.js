import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Skip waiting so new SW activates immediately
        skipWaiting: true,
        clientsClaim: true,
        // Don't precache the index.html — let it always hit network first
        navigateFallback: null,
        runtimeCaching: [
          {
            // App shell JS/CSS — network first, fall back to cache
            urlPattern: /\/assets\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      manifest: false, // we provide our own manifest.json in public/
    }),
  ],
})
