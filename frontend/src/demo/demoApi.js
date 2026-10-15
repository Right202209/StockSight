/**
 * Drop-in replacement for `./api` used by the GitHub Pages build.
 *
 * The deployed demo has no backend, no API keys and no outbound network, so
 * this module answers the same four calls (`health`, `quote`, `analyze`,
 * `history`) from the committed sample set in `./dataset.js`.
 *
 * It is not a mock of the *network* — it is a mock of the *backend contract*:
 * the same shapes, the same error codes, the same "the server's quote is the
 * source of truth" rule. That keeps `App.jsx` untouched, which is the point:
 * the demo exercises the real UI, so a demo-only code path can't hide a
 * regression in the real one.
 *
 * Deliberate differences from the real backend, all visible in the UI:
 *   - nothing is persisted; an analysis lasts until the page reloads,
 *   - `analyze` returns a written summary from the sample set instead of
 *     calling a model,
 *   - quotes only exist for the symbols in the sample set (404 otherwise).
 */

import { ApiError } from '../api'
import { DEMO_ANALYSES } from './dataset'

// The app imports { api, ApiError } from './api'. Under the pages build the
// alias rewrites './api' to this module, so ApiError must be exported from
// here too — same class (re-exported), same behavior everywhere.
export { ApiError }

// Not instant: a small delay gives the loading states (skeletons, the
// button spinner) a chance to render, so the demo shows how the app behaves
// while waiting rather than snapping straight to the result.
const LATENCY_MS = 280

const HISTORY_LIMIT = 20

const abortError = () => new DOMException('Aborted', 'AbortError')

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      done()
      reject(abortError())
    }
    const timer = setTimeout(() => {
      done()
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * The active UI language, read the same way `i18n` writes it (`I18nProvider`
 * mirrors every language change onto `<html lang>`). Reading the DOM here
 * avoids threading a language parameter through the API surface.
 */
function currentLang() {
  if (typeof document === 'undefined') return 'en'
  return document.documentElement.lang?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const bySymbol = new Map(DEMO_ANALYSES.map((e) => [e.symbol, e]))

function localize(entry, lang) {
  const localized = lang === 'zh' && entry.ai_summary_zh
  return {
    id: entry.id,
    symbol: entry.symbol,
    quote_data: entry.quote_data,
    ai_summary: localized ? entry.ai_summary_zh : entry.ai_summary,
    sentiment: entry.sentiment,
    risk_level: entry.risk_level,
    created_at: entry.created_at,
  }
}

function normalizeSymbol(raw) {
  const sym = (raw || '').trim().toUpperCase()
  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(sym)) {
    throw new ApiError('Invalid symbol — must be 1-5 uppercase letters, optional .XX suffix', {
      status: 400,
      code: 'INVALID_SYMBOL',
    })
  }
  return sym
}

export const api = {
  async health() {
    await sleep(LATENCY_MS, undefined)
    return { status: 'ok' }
  },

  async quote(symbol, { signal } = {}) {
    const sym = normalizeSymbol(symbol)
    const entry = bySymbol.get(sym)
    await sleep(LATENCY_MS, signal)
    if (!entry) {
      // Mirrors a 404/502 from the real backend: the symbol simply has no
      // sample row. The ticker field regains focus and the notice explains.
      throw new ApiError(`No sample data for ${sym} in this static demo.`, {
        status: 404,
        code: 'NOT_IN_DEMO_SET',
      })
    }
    // A copy, so callers can never mutate the module-level sample set.
    return { ...entry.quote_data }
  },

  async analyze(payload, { signal } = {}) {
    const sym = normalizeSymbol(payload?.symbol)
    const quote = payload?.quote_data
    if (!quote || quote.symbol?.toUpperCase() !== sym) {
      throw new ApiError('symbol and quote_data.symbol must match', {
        status: 400,
        code: 'SYMBOL_MISMATCH',
      })
    }

    const entry = bySymbol.get(sym)
    await sleep(LATENCY_MS + 180, signal)
    if (!entry) {
      throw new ApiError(`No sample analysis for ${sym} in this static demo.`, {
        status: 404,
        code: 'NOT_IN_DEMO_SET',
      })
    }

    // Same staleness guard the backend applies (main.py): a fabricated or
    // out-of-date price must not produce an analysis. This is what makes
    // clicking through history rows behaving correctly in the demo.
    const serverPrice = entry.quote_data.price
    const clientPrice = quote.price
    if (Math.abs(clientPrice - serverPrice) > serverPrice * 0.02) {
      throw new ApiError('Quote changed since it was fetched. Refreshing…', {
        status: 409,
        code: 'QUOTE_STALE',
      })
    }

    const lang = currentLang()
    const localized = lang === 'zh' && entry.ai_summary_zh
    return {
      id: entry.id,
      summary: localized ? entry.ai_summary_zh : entry.ai_summary,
      sentiment: entry.sentiment,
      risk_level: entry.risk_level,
      // Stamped now so the "Generated" stat reads as a fresh analysis, even
      // though the underlying snapshot predates it.
      created_at: new Date().toISOString(),
      reused: false,
    }
  },

  async history(limit = HISTORY_LIMIT) {
    await sleep(LATENCY_MS, undefined)
    const lang = currentLang()
    const capped = Math.max(1, Math.min(Number(limit) || HISTORY_LIMIT, HISTORY_LIMIT))
    return { items: DEMO_ANALYSES.slice(0, capped).map((e) => localize(e, lang)) }
  },
}
