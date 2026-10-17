import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    // em dev, o Worker roda com `wrangler dev` na 8787
    proxy: { '/api': 'http://localhost:8787', '/auth': 'http://localhost:8787', '/m': 'http://localhost:8787' },
  },
});
