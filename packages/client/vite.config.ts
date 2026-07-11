import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// __E2E__ is compile-time replaced (so dead-code-eliminated in releases). It's on
// for dev and for e2e builds (VITE_E2E=1) so Playwright's window.__e2e helpers exist.
export default defineConfig(({ mode }) => ({
  define: {
    __E2E__: JSON.stringify(mode !== 'production' || process.env.VITE_E2E === '1'),
  },
  plugins: [react(), tailwind()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': { target: 'http://localhost:8080' },
      '/j': { target: 'http://localhost:8080' },
    },
  },
}));
