import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
            manifest: {
                name: 'Tabi — viaggi insieme',
                short_name: 'Tabi',
                description: 'Pianifica viaggi con i tuoi amici: giorni, alloggi, prenotazioni e idee.',
                lang: 'it',
                start_url: '/trips',
                display: 'standalone',
                background_color: '#F3F2EE',
                theme_color: '#F3F2EE',
                icons: [
                    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                navigateFallback: '/index.html',
                globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
                // the map chunk and its worker are ~1 MB each
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
                runtimeCaching: [
                    {
                        // map tiles and styles: areas already seen stay visible offline
                        urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'map-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 } },
                    },
                    {
                        urlPattern: ({ url }) => url.hostname === 'fonts.bunny.net',
                        handler: 'CacheFirst',
                        options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
});
