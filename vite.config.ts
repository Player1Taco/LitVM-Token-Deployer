import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Fix #24: Path alias resolution for @ imports
      '@': path.resolve(__dirname, './src'),
    },
  },
});
