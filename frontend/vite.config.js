import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8001';

export default defineConfig({
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
});
