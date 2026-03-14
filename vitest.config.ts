import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@@': fileURLToPath(new URL('./frontend', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./frontend/__tests__/setup.ts'],
    css: false,
  },
});

