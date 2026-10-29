import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000, // Phaser (~1.2 MB) + Three.js (~0.6 MB) minified
  },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
