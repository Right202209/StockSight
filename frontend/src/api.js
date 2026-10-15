const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status, code, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status // 0 = network failure or timeout
    this.code = code // machine-readable code from the backend (B-11)
    this.payload = payload
  }
}

// FastAPI's 422 `detail` is an array of {loc, msg, type} — flatten it so the
// UI never renders "[object Object]".
function messageFrom(payload, status, fallback) {
  const detail = payload?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => d?.msg).filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (typeof payload?.error === 'string' && payload.error) return payload.error
  return fallback || `Request failed (${status})`
}

const DEFAULT_TIMEOUT = 15000

async function request(path, { method = 'GET', body, signal, timeout = DEFAULT_TIMEOUT } = {}) {
  // One controller owns both the timeout and the caller's cancellation, so a
  // hung request can never pin the UI (or a worker thread) forever.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), timeout)
  const forwardAbort = () => ctrl.abort(signal.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e // caller superseded this request — stay silent
    if (e?.name === 'TimeoutError' || ctrl.signal.reason?.name === 'TimeoutError') {
      throw new ApiError('Request timed out', { status: 0, code: 'TIMEOUT' })
    }
    throw new ApiError('Network error — is the backend running?', { status: 0, code: 'NETWORK' })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }

  // Tolerate non-JSON bodies (proxy error pages, cold-start HTML).
  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }

  if (!res.ok) {
    throw new ApiError(messageFrom(payload, res.status, `Request failed (${res.status})`), {
      status: res.status,
      code: payload?.code,
      payload,
    })
  }
  return payload
}

export const api = {
  // Cold starts on Render's free tier can take tens of seconds; the health
  // probe is the one call allowed to wait that long.
  health: (opts) => request('/api/health', { timeout: 60000, ...opts }),
  quote: (symbol, opts) => request(`/api/quote?symbol=${encodeURIComponent(symbol)}`, opts),
  analyze: (payload, opts) =>
    request('/api/analyze', { method: 'POST', body: payload, timeout: 30000, ...opts }),
  history: (limit = 20, opts) => request(`/api/history?limit=${limit}`, opts),
}
