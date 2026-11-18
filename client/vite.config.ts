import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173 },
  build: {
    // The Firebase SDK is one large, cacheable vendor chunk.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'] },
      },
    },
  },
});
