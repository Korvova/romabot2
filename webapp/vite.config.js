import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/2/',
  plugins: [react()],
  server: {
    proxy: {
      '/2/admin/settings': 'http://localhost:3002',
      '/2/get-assistant':  'http://localhost:3002',
      '/2/get-tools':      'http://localhost:3002',
      '/2/ws': {
        target: 'ws://localhost:3002',
        ws: true
      }
    }
  }
});
