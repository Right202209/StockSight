import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Build config for the static GitHub Pages demo (`npm run build:pages`).
//
// Two differences from the normal build:
//   1. `base` is the repository path, because Pages serves the site from
//      https://<user>.github.io/StockSight/ — asset URLs must be prefixed.
//   2. `./api` is redirected to the offline sample-data implementation, so
//      the deployed page makes no backend calls at all.
//
// The alias is applied by a tiny plugin rather than Vite's `resolve.alias`
// because Vite bundles the config file and runs it from its own directory: a
// relative alias value would be resolved against that temp directory, not
// this one. Resolving to an absolute path here removes the ambiguity.

const root = dirname(fileURLToPath(import.meta.url))

function absoluteAlias(map) {
  const entries = Object.entries(map).map(([find, target]) => [find, resolve(root, target)])
  return {
    name: 'stocksight:absolute-alias',
    enforce: 'pre',
    resolveId(source) {
      // Exact match only. A prefix match would also rewrite './apifoo'.
      const hit = entries.find(([find]) => find === source)
      return hit ? hit[1] : null
    },
  }
}

/**
 * GitHub Pages serves `index.html` at a directory root, but Vite always names
 * an HTML entry after its source file — so the page builds as
 * `index-pages.html` and `scripts/finalize-pages-build.mjs` renames it as the
 * last step of `npm run build:pages`. The source file is named for clarity: it
 * sits next to the real `index.html` and must not be confused with it.
 */

export default defineConfig({
  base: '/StockSight/',
  plugins: [
    absoluteAlias({
      './api': 'src/demo/demoApi.js',
    }),
    react(),
  ],
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(root, 'index-pages.html') },
    },
  },
})
