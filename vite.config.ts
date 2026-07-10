import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? (env.VITE_BASE || '/ifc-viewer-pro/') : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      esbuild: {
        charset: 'ascii',
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('three') || id.includes('@three') || id.includes('three-mesh-bvh')) {
                  return 'three-vendor';
                }
                if (id.includes('lucide-react')) {
                  return 'lucide-vendor';
                }
                if (id.includes('web-ifc')) {
                  return 'web-ifc-vendor';
                }
                return 'vendor';
              }
            }
          }
        }
      }
    };
});
