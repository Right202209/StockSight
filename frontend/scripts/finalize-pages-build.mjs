#!/usr/bin/env node
/**
 * Last step of `npm run build:pages`: GitHub Pages serves `index.html` from a
 * directory root, but Vite names an HTML entry after its source file, so the
 * gallery builds as `dist-pages/index-pages.html`. Rename it.
 *
 * Safe to rename because the document's own asset references are all
 * base-prefixed by Vite (`/StockSight/assets/...`) — none of them derive from
 * the document's filename. This script asserts that rather than assuming it.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-pages')
const from = join(dist, 'index-pages.html')
const to = join(dist, 'index.html')

const html = readFileSync(from, 'utf8')

// A root-relative asset would 404 under https://<user>.github.io/StockSight/,
// so fail the build instead of deploying a page with no CSS.
const unresolved = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)]
  .map((m) => m[1])
  .filter((url) => !url.startsWith('/StockSight/') && !url.startsWith('//'))
if (unresolved.length) {
  throw new Error(`pages build: non-base-prefixed asset URLs: ${unresolved.join(', ')}`)
}

renameSync(from, to)
writeFileSync(to, html, 'utf8')
console.log('pages build: dist-pages/index.html ready')
