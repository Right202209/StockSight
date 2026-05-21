const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Network error — is the backend running?', { status: 0 })
  }

  let payload = null
  const text = await res.text()
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { raw: text } }
  }

  if (!res.ok) {
    const message = payload?.error || payload?.detail || `Request failed (${res.status})`
    throw new ApiError(message, { status: res.status, payload })
  }
  return payload
}

export const api = {
  health: () => request('/api/health'),
  quote: (symbol, signal) => request(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { signal }),
  analyze: (symbol, quote_data, signal) =>
    request('/api/analyze', { method: 'POST', body: { symbol, quote_data }, signal }),
  history: (limit = 20, signal) => request(`/api/history?limit=${limit}`, { signal }),
}

export { ApiError }
