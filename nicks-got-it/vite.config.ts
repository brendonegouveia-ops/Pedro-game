import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified
  },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
