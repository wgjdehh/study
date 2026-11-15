import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the browser only ever talks to Vite; /api is proxied to the Express
// server, so the LLM key never leaves the server process.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
