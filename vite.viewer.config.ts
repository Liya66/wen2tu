import { defineConfig } from 'vite'

/**
 * Builds the read-only viewer used in exported HTML files into
 * generated/viewer/ (viewer.js + viewer.css). The app inlines those files
 * into each export, so an exported map is a single self-contained file.
 */
export default defineConfig({
  build: {
    outDir: 'generated/viewer',
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: 'src/viewer/viewer.ts',
      name: 'Wen2tuViewer',
      formats: ['iife'],
      fileName: () => 'viewer.js',
      cssFileName: 'viewer',
    },
  },
})
