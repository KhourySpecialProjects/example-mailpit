import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // reachable from outside the container
    port: 5173,
    strictPort: true,
    // Same-origin requests from the browser are forwarded to the api service,
    // so no CORS setup is needed.
    proxy: { '/api': 'http://api:3000' },
  },
});
