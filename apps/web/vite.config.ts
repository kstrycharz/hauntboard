import { defineConfig } from 'vite';
export default defineConfig({
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
