const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

class ApiError extends Error {
  constructor(message, { status, payload, requestId } = {}) {
    super(message)
    this.status = status
    this.payload = payload
    this.requestId = requestId
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  const forwardAbort = () => controller.abort(signal.reason)
  if (signal?.aborted) controller.abort(signal.reason)
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    if (e.name === 'AbortError') {
      throw new ApiError('Request timed out — please try again.', { status: 0 })
    }
    throw new ApiError('Network error — is the backend running?', { status: 0 })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }

  let payload = null
  const text = await res.text()
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { raw: text } }
  }

  if (!res.ok) {
    const message = payload?.error || payload?.detail || `Request failed (${res.status})`
    throw new ApiError(message, {
      status: res.status,
      payload,
      requestId: res.headers.get('x-request-id') || undefined,
    })
  }
  return payload
}

export const api = {
  health: () => request('/api/health'),
  ready: () => request('/api/ready'),
  quote: (symbol, signal) => request(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { signal }),
  analyze: (symbol, quote_data, signal) =>
    request('/api/analyze', { method: 'POST', body: { symbol, quote_data }, signal }),
  history: (limit = 20, signal) => request(`/api/history?limit=${limit}`, { signal }),
}

export { ApiError }
