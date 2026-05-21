import { useEffect, useState } from 'react'
import { formatLongDate } from '../utils/format'

export default function Masthead({ theme, onToggleTheme, healthy }) {
  const [date, setDate] = useState(() => formatLongDate())

  useEffect(() => {
    const t = setInterval(() => setDate(formatLongDate()), 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="border-b border-ink-500/15 dark:border-ink-50/15 pt-7 pb-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="display-italic text-5xl sm:text-6xl md:text-7xl font-medium tracking-tightest leading-none text-ink-500 dark:text-ink-50">
            StockSight
          </h1>
          <span className="hidden sm:inline label-eyebrow translate-y-[-2px]">
            AI · Equities
          </span>
        </div>

        <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-ink-300 dark:text-ink-100">
          <span className="hidden md:inline">VOL. I · No. 001</span>
          <span className="font-mono normal-case tracking-normal text-[12px] text-ink-400 dark:text-ink-50">
            {date}
          </span>
          <HealthDot healthy={healthy} />
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-6 flex-wrap">
        <p className="font-display italic text-ink-400 dark:text-ink-100 text-lg sm:text-xl tracking-tight max-w-2xl">
          Read the tape. Hear the AI.
          <span className="not-italic font-sans text-ink-300 dark:text-ink-100 text-sm ml-3">
            Real-time quotes, sober commentary, no hype.
          </span>
        </p>
      </div>
    </header>
  )
}

function HealthDot({ healthy }) {
  const tone =
    healthy === true
      ? 'bg-forest-500 dark:bg-forest-400'
      : healthy === false
        ? 'bg-oxblood-500 dark:bg-oxblood-400'
        : 'bg-ink-300 dark:bg-ink-100'
  const label =
    healthy === true ? 'Online' : healthy === false ? 'Offline' : 'Checking…'

  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 normal-case tracking-normal text-[11px] font-mono"
      title={`API: ${label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone} animate-pulse-dot`} />
      {label}
    </span>
  )
}

function ThemeToggle({ theme, onToggleTheme }) {
  return (
    <button
      type="button"
      onClick={onToggleTheme}
      className="focus-ring relative inline-flex items-center justify-center w-9 h-9 border border-ink-500/20 dark:border-ink-50/25 hover:bg-ink-500/5 dark:hover:bg-ink-50/10 transition-colors"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="display-italic text-xl text-ink-500 dark:text-ink-50 leading-none translate-y-[-1px]">
        {theme === 'dark' ? '☼' : '☾'}
      </span>
    </button>
  )
}
