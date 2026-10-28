import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE is "/forza/" when deployed to GitHub Pages (see .github/workflows/deploy-app.yml).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Forza!',
        short_name: 'Forza!',
        description: 'Strength, food and healthy habits for the people you love.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF7F2',
        theme_color: '#C2410C',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Exercise photos (~7 MB) are cached the first time each one is viewed, not all at install.
        globIgnores: ['exercises/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/exercises/'),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-photos', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
