import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8080',
      '/viewer': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/schema': 'http://localhost:8080',
      '/sources': 'http://localhost:8080',
      '/session': 'http://localhost:8080',
      '/metrics': 'http://localhost:8080',
      '/events': 'http://localhost:8080',
      '/preprocess': 'http://localhost:8080',
      '/upload-source': 'http://localhost:8080',
      '/rtc': 'http://localhost:8080',
      '/storage': 'http://localhost:8080'
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
});
