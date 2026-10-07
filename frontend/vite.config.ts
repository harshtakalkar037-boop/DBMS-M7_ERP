import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The config file runs in Node, but the frontend deliberately does not depend on
// @types/node — this single declaration is enough for the one variable we read.
declare const process: { env: Record<string, string | undefined> };

/**
 * Where the Express API listens. Local development uses 127.0.0.1:8080; inside
 * Docker Compose the browser reaches the API through this proxy under the
 * service name, so VITE_API_TARGET is set to http://api:8080 there.
 * The browser itself only ever requests the relative path /api.
 */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The app is served through a proxied preview host, so accept any Host header.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1600 },
});
