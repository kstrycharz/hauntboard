import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
export default defineConfig({
  plugins: [wasm()],
  optimizeDeps: { exclude: ['@tari-project/ootle-wasm'] },
  build: { target: 'es2022' },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['web'],
    proxy: process.env.API_PROXY_URL
      ? { '/api': process.env.API_PROXY_URL, '/health': process.env.API_PROXY_URL }
      : undefined,
  },
  preview: { port: 4173 },
});
