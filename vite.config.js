import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths work for `vite preview` and for a GitHub Pages
  // project site, where the board is not hosted at the domain root.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
