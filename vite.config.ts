import path from 'node:path'
import { configDefaults } from 'vitest/config'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './server/devApi.ts'

export default defineConfig(({ mode }) => {
  // Server code (api/, server/) reads process.env; in dev, fill it from .env.local.
  Object.assign(process.env, { PGLITE_DIR: '.data/pglite', ...loadEnv(mode, process.cwd(), '') })

  return {
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    // Playwright owns e2e/; Vitest runs everything else.
    test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
    plugins: [
      react(),
      tailwindcss(),
      devApi(),
      VitePWA({
        // Our own service worker (src/sw.ts): offline shell plus push handling.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // The app shows "Update available → Reload" instead of swapping versions silently.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
        injectManifest: {
          // Precache the whole app shell so it opens with no network at all.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        // Run the service worker in `npm run dev` too, so push can be tried locally.
        devOptions: { enabled: true, type: 'module' },
        manifest: {
          name: 'Get It Done',
          short_name: 'Get It Done',
          description: 'Groceries and to-dos in one list.',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          background_color: '#f7faf8',
          theme_color: '#f7faf8',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  }
})
