import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import offlinePlugin from './offline-plugin';

export default defineConfig({
  plugins: [react(), offlinePlugin()],
  base: './',
  server: {
    proxy: {
      '/lighter-api': {
        target: 'https://mainnet.zklighter.elliot.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lighter-api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
        },
      },
    },
  },
});
