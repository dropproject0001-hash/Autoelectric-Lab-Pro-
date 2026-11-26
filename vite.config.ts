import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({command}) => {
  const isBuild = command === 'build';
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isBuild
        ? [
            VitePWA({
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.js',
              registerType: 'prompt',
              injectRegister: null,
              injectManifest: {
                injectionPoint: undefined,
              },
              includeAssets: [
                'favicon.ico',
                'favicon-32x32.png',
                'apple-touch-icon.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'pwa-maskable-192x192.png',
                'pwa-maskable-512x512.png',
                'offline.html',
                'assets/images/file_0000000098d48211abb177ce752b7b0e_62980da7.png',
              ],
              manifest: {
                id: '/',
                name: 'AutoElectric Lab Pro',
                short_name: 'AutoElec Lab',
                description:
                  'Automotive Electronics Diagnostics, ECU Bench Testing and AI Repair Assistance.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                theme_color: '#071426',
                background_color: '#071426',
                orientation: 'any',
                icons: [
                  {
                    src: '/pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: '/pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: '/pwa-maskable-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                  {
                    src: '/pwa-maskable-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              devOptions: {
                enabled: false,
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      holdUntilCrawlEnd: false,
      include: [
        'three',
        'three/addons/controls/OrbitControls.js',
        'three/addons/environments/RoomEnvironment.js',
        'd3',
        'recharts',
      ],
      exclude: ['html2canvas', 'canvg', 'dompurify'],
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'vendor-three';
            }
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/jspdf')) {
              return 'vendor-pdf';
            }
            if (id.includes('phTroubleScenarios') && id.endsWith('.json')) {
              return 'data-ph-scenarios';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
