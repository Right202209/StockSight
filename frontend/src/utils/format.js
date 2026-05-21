const PRICE_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const PCT_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

const VOL_FMT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

const VOL_FULL_FMT = new Intl.NumberFormat('en-US')

export const formatPrice = (n) => (Number.isFinite(n) ? PRICE_FMT.format(n) : '—')

export const formatChange = (n) => {
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${PRICE_FMT.format(Math.abs(n))}`
}

export const formatPercent = (n) => (Number.isFinite(n) ? `${PCT_FMT.format(n)}%` : '—')

export const formatVolume = (n) => (Number.isFinite(n) ? VOL_FMT.format(n) : '—')
export const formatVolumeFull = (n) => (Number.isFinite(n) ? VOL_FULL_FMT.format(n) : '—')

export const directionOf = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat')

export const formatDateTime = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export const formatTime = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export const formatLongDate = (d = new Date()) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const SENTIMENT_TONES = {
  Bullish: {
    color: 'forest',
    label: 'Bullish',
    mark: '▲',
    text: 'text-forest-500 dark:text-forest-400',
    bg: 'bg-forest-500/8 dark:bg-forest-400/10',
    border: 'border-forest-500/30 dark:border-forest-400/30',
  },
  Bearish: {
    color: 'oxblood',
    label: 'Bearish',
    mark: '▼',
    text: 'text-oxblood-500 dark:text-oxblood-400',
    bg: 'bg-oxblood-500/8 dark:bg-oxblood-400/10',
    border: 'border-oxblood-500/30 dark:border-oxblood-400/30',
  },
  Neutral: {
    color: 'gold',
    label: 'Neutral',
    mark: '◆',
    text: 'text-gold-500 dark:text-gold-400',
    bg: 'bg-gold-500/8 dark:bg-gold-400/10',
    border: 'border-gold-500/30 dark:border-gold-400/30',
  },
}

export const toneOf = (sentiment) => SENTIMENT_TONES[sentiment] || SENTIMENT_TONES.Neutral

export const directionTone = (dir) => {
  if (dir === 'up') return 'text-forest-500 dark:text-forest-400'
  if (dir === 'down') return 'text-oxblood-500 dark:text-oxblood-400'
  return 'text-ink-300 dark:text-ink-100'
}
