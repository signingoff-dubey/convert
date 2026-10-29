import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const pages = ['overlay', 'settings', 'toast', 'toolwin', 'float', 'loader'] as const;

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    build: {
      // Sandboxed preloads can only require 'electron', so everything else is bundled in.
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron'],
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: Object.fromEntries(pages.map((p) => [p, resolve(`src/renderer/${p}.html`)])),
      },
    },
  },
});
