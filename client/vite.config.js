import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * host: '0.0.0.0' so phones on the same Wi-Fi can open the dev server by the
 * laptop's LAN IP. The /api and /socket.io proxies mean the client can call
 * relative URLs in dev and still reach the Express server on port 5000 —
 * which is why VITE_API_URL is optional (see client/.env.example).
 */
export default defineConfig(({ mode }) => {
  const target = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, ws: true, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0', port: 4173 },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
    },
  };
});
