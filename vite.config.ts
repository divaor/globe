import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/globe/) and any static host.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: 'Atlas Globe',
        short_name: 'Atlas',
        description: 'A detailed, colourful world globe with many map filters, projections, a political timeline and a Pangea animation.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#050b18',
        theme_color: '#07101f',
        categories: ['education', 'navigation', 'travel'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Ambient mode', short_name: 'Ambient', url: './#ambient=1', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // App shell + the data needed for the first view are precached; everything else is cached on first use.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png', 'data/base/countries-110m.json', 'data/base/countries-50m.json',
          'data/base/countries-meta.json', 'data/base/cities.json', 'data/base/land-110m.json', 'data/layers/marine.json', 'data/layers/physical-50m.json'],
        globIgnores: ['flags/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes('/data/') && /\.(jpg|png|webp)$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'atlas-images', expiration: { maxEntries: 60 } } },
          { urlPattern: ({ url }) => url.pathname.includes('/data/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'atlas-data', expiration: { maxEntries: 400 } } },
          { urlPattern: ({ url }) => url.pathname.includes('/flags/'), handler: 'CacheFirst', options: { cacheName: 'atlas-flags', expiration: { maxEntries: 300 } } },
          // Pictures on the stories' cards: Wikipedia summaries and their thumbnails, kept once seen.
          { urlPattern: ({ url }) => /\.wikipedia\.org$/.test(url.hostname) && url.pathname.startsWith('/api/rest_v1/page/summary/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'atlas-wiki', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
          // A story item's own picture: Commons answers with a redirect to the thumbnail.
          { urlPattern: ({ url }) => url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:FilePath/'), handler: 'CacheFirst', options: { cacheName: 'atlas-wiki-img', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } } },
          // Wikimedia serves pictures from thumb.wikimedia.org now, and from upload.wikimedia.org before.
          { urlPattern: ({ url }) => url.hostname === 'upload.wikimedia.org' || url.hostname === 'thumb.wikimedia.org', handler: 'CacheFirst', options: { cacheName: 'atlas-wiki-img', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});
