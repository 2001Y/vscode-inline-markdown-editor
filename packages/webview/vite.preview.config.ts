import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    target: 'chrome120',
    outDir: '../extension/media/webview',
    emptyOutDir: false,
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/preview/mermaidPreview.ts'),
      name: 'InlineMarkMermaidPreview',
      formats: ['iife'],
      fileName: () => 'mermaidPreviewStandalone.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
