// All formatters are built per-locale and memoized by the caller, so switching
// language re-renders with new formatters instead of mutating module state
// (F-08/F-09). Numbers stay en-US — financial grouping/conventions don't change
// with UI language; dates follow the active locale.

const MARKET_TZ = 'America/New_York'

export function makeFormatters(lang = 'en') {
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US'

  const priceFmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const pctFmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })
  const volFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })
  const volFullFmt = new Intl.NumberFormat('en-US')
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // Exchange-local time with its real abbreviation (EDT/EST) rather than a
  // hardcoded "UTC" label that was wrong for a US-equities product (F-09).
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: MARKET_TZ,
    timeZoneName: 'short',
  })
  const longDateFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const safeDate = (iso) => {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return {
    price: (n) => (Number.isFinite(n) ? priceFmt.format(n) : '—'),
    change: (n) => {
      if (!Number.isFinite(n)) return '—'
      const sign = n > 0 ? '+' : n < 0 ? '−' : ''
      return `${sign}${priceFmt.format(Math.abs(n))}`
    },
    percent: (n) => (Number.isFinite(n) ? `${pctFmt.format(n)}%` : '—'),
    volume: (n) => (Number.isFinite(n) ? volFmt.format(n) : '—'),
    volumeFull: (n) => (Number.isFinite(n) ? volFullFmt.format(n) : '—'),
    dateTime: (iso) => {
      const d = safeDate(iso)
      return d ? dateTimeFmt.format(d) : iso || '—'
    },
    // "14:32:05 EDT" — pair with the `quote.asOf` copy, which supplies the
    // surrounding words. The zone name comes from Intl, never a literal.
    time: (iso) => {
      const d = safeDate(iso)
      return d ? timeFmt.format(d) : '—'
    },
    longDate: (d = new Date()) => longDateFmt.format(d),
  }
}

export const directionOf = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat')

const SENTIMENT_TONES = {
  Bullish: {
    color: 'forest',
    label: 'Bullish',
    mark: '▲',
    text: 'text-forest-500 dark:text-forest-300',
    bg: 'bg-forest-500/8 dark:bg-forest-400/10',
    border: 'border-forest-500/30 dark:border-forest-400/30',
  },
  Bearish: {
    color: 'oxblood',
    label: 'Bearish',
    mark: '▼',
    text: 'text-oxblood-500 dark:text-oxblood-300',
    bg: 'bg-oxblood-500/8 dark:bg-oxblood-400/10',
    border: 'border-oxblood-500/30 dark:border-oxblood-400/30',
  },
  Neutral: {
    color: 'gold',
    label: 'Neutral',
    mark: '◆',
    // gold-300, not -400: on the dark ground -400 is ~4.0:1, under AA (F-10).
    text: 'text-gold-600 dark:text-gold-300',
    bg: 'bg-gold-500/8 dark:bg-gold-400/10',
    border: 'border-gold-500/30 dark:border-gold-400/30',
  },
}

// The label is the canonical server value (Bullish/Bearish/Neutral) — not
// translated, because it mirrors what the LLM returned and what the DB stores.
export const toneOf = (sentiment) => SENTIMENT_TONES[sentiment] || SENTIMENT_TONES.Neutral

export const directionTone = (dir) => {
  if (dir === 'up') return 'text-forest-500 dark:text-forest-300'
  if (dir === 'down') return 'text-oxblood-500 dark:text-oxblood-300'
  return 'text-ink-300 dark:text-ink-100'
}
