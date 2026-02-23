import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  base: '/simpledit/',

  build: {
    // Output directory
    outDir: 'dist',

    // Generate sourcemaps for debugging
    sourcemap: true,

    // Minification (using esbuild instead of terser)
    minify: 'esbuild',

    // Chunk splitting strategy
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'managers': [
            './src/managers/selectionManager.js',
            './src/managers/uiManager.js',
            './src/managers/fileIOManager.js',
            './src/managers/renderManager.js',
            './src/managers/geometryController.js',
          ],
        },
      },
    },

    // Target modern browsers
    target: 'es2020',

    // Chunk size warning limit (KB)
    chunkSizeWarningLimit: 1000,
  },

  // Development server
  server: {
    port: 3000,
    open: true,
  },

  // Path resolution
  resolve: {
    alias: {
      '@': '/src',
    },
  },

  // Include WASM files as assets
  assetsInclude: ['**/*.wasm'],

  // Optimize dependencies
  optimizeDeps: {
    exclude: ['@rdkit/rdkit'], // Exclude RDKit from pre-bundling to preserve WASM loading
  },

  // Plugin to copy tutorial and API docs after build
  plugins: [
    {
      name: 'copy-docs',
      closeBundle() {
        try {
          // Create tutorial directory
          const tutorialDir = join('dist', 'tutorial');
          mkdirSync(tutorialDir, { recursive: true });

          // Copy tutorial.html to dist/tutorial/index.html
          copyFileSync('tutorial.html', join(tutorialDir, 'index.html'));
          console.log('✓ Copied tutorial.html to dist/tutorial/index.html');

          // Copy docs/api to dist/api
          cpSync('docs/api', 'dist/api', { recursive: true });
          console.log('✓ Copied docs/api to dist/api');

          // Copy RDKit library to dist/lib/rdkit
          const rdkitDest = join('dist', 'lib', 'rdkit');
          mkdirSync(rdkitDest, { recursive: true });
          cpSync(join('public', 'lib', 'rdkit'), rdkitDest, { recursive: true });
          console.log('✓ Copied RDKit library to dist/lib/rdkit');

          // Copy JSME library to dist/lib/jsme
          const jsmeDest = join('dist', 'lib', 'jsme');
          mkdirSync(jsmeDest, { recursive: true });
          cpSync(join('public', 'lib', 'jsme'), jsmeDest, { recursive: true });
          console.log('✓ Copied JSME library to dist/lib/jsme');

          // Copy OpenChemLib resources to dist/lib/openchemlib
          const oclDest = join('dist', 'lib', 'openchemlib');
          mkdirSync(oclDest, { recursive: true });
          cpSync(join('public', 'lib', 'openchemlib'), oclDest, { recursive: true });
          console.log('✓ Copied OpenChemLib resources to dist/lib/openchemlib');
        } catch (err) {
          console.error('Error copying docs:', err);
        }
      },
    },
  ],
});
