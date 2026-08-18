import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/bridge/client',
  plugins: [react()],
  build: {
    outDir: '../../../dist/bridge-client',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/bridge/client/index.html'),
    },
  },
});
