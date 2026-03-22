/**
 * Vite 7.x モダン化:
 * - build.target を VS Code Webview の Chromium バージョンに合わせて明示
 * - VS Code 1.85.0+ は Chromium ~120 を使用
 * - これにより不要なポリフィルやトランスパイルを回避し、バンドルサイズを削減
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    // VS Code 1.85.0+ の Webview は Chromium 120+ を使用
    // 明示的に target を設定することで、不要なトランスパイルを回避
    target: 'chrome120',
    outDir: '../extension/media/webview',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/main.ts'),
      },
      output: {
        // Use hash to avoid stale webview cache (service worker can keep old index.js).
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
        manualChunks: (id) => {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/@tiptap/')) {
            return 'tiptap';
          }
          if (id.includes('/prosemirror-') || id.includes('/@tiptap/pm/')) {
            return 'prosemirror';
          }
          if (id.includes('/lowlight/')) {
            return 'lowlight';
          }
          if (id.includes('/@vscode/codicons/')) {
            return 'codicons';
          }
          return 'vendor';
        },
      },
    },
    sourcemap: false,
    minify: 'esbuild',
  },
});
