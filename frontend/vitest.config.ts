import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    css: false,
  },
});

