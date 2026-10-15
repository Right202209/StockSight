import { memo, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'

function Masthead({ theme, onToggleTheme, healthy }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  // Update the clock year tuples on the next minute boundary, then once a
  // minute, so the date never lags and we don't tick mid-second (F-06).
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const delay = 60_000 - (Date.now() % 60_000)
    const first = setTimeout(tick, delay + 50)
    const timer = setInterval(tick, 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])

  const dateLabel = useMemo(() => {
    const d = new Date(now)
    return d.toLocaleDateString(
      undefined,
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
    )
  }, [now])

  return (
    <header className="border-b border-ink-500/15 dark:border-ink-50/15 pt-7 pb-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="display-italic text-5xl sm:text-6xl md:text-7xl font-medium tracking-tightest leading-none text-ink-500 dark:text-ink-50">
            StockSight
          </h1>
          <span className="hidden sm:inline label-eyebrow translate-y-[-2px]">
            {t('app.eyebrow')}
          </span>
        </div>

        <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-ink-300 dark:text-ink-100">
          <span className="hidden md:inline">{t('app.volume')}</span>
          <span className="font-mono normal-case tracking-normal text-[12px] text-ink-400 dark:text-ink-50">
            {dateLabel}
          </span>
          <HealthDot healthy={healthy} />
          <LanguageToggle />
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-6 flex-wrap">
        <p className="font-display italic text-ink-400 dark:text-ink-100 text-lg sm:text-xl tracking-tight max-w-2xl">
          {t('app.tagline')}
          <span className="not-italic font-sans text-ink-300 dark:text-ink-100 text-sm ml-3">
            {t('app.subtitle')}
          </span>
        </p>
      </div>
    </header>
  )
}

function HealthDot({ healthy }) {
  const { t } = useI18n()
  const tone =
    healthy === true
      ? 'bg-forest-500 dark:bg-forest-400'
      : healthy === false
        ? 'bg-oxblood-500 dark:bg-oxblood-400'
        : 'bg-ink-300 dark:bg-ink-100'
  const label =
    healthy === true ? t('health.online') : healthy === false ? t('health.offline') : t('health.checking')

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

function LanguageToggle() {
  const { toggleLang, t } = useI18n()
  return (
    <button
      type="button"
      onClick={toggleLang}
      className="focus-ring relative inline-flex items-center justify-center px-2 h-9 border border-ink-500/20 dark:border-ink-50/25 hover:bg-ink-500/5 dark:hover:bg-ink-50/10 transition-colors text-[11px] font-mono text-ink-500 dark:text-ink-50"
      aria-label={t('lang.aria')}
    >
      {t('lang.toggle')}
    </button>
  )
}

function ThemeToggle({ theme, onToggleTheme }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onToggleTheme}
      className="focus-ring relative inline-flex items-center justify-center w-9 h-9 border border-ink-500/20 dark:border-ink-50/25 hover:bg-ink-500/5 dark:hover:bg-ink-50/10 transition-colors"
      aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
    >
      <span className="display-italic text-xl text-ink-500 dark:text-ink-50 leading-none translate-y-[-1px]">
        {theme === 'dark' ? '☼' : '☾'}
      </span>
    </button>
  )
}

export default memo(Masthead)