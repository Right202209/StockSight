import { memo, useMemo } from 'react'
import { useI18n } from '../i18n'
import { directionOf, directionTone } from '../utils/format'

function QuoteCard({ quote, onAnalyze, analyzing, freshKey }) {
  const { t, formats } = useI18n()
  const dir = directionOf(quote.change)
  const dirTone = directionTone(dir)
  const dirMark = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'

  const stats = useMemo(
    () => [
      { label: t('quote.stat.high'), value: formats.price(quote.high) },
      { label: t('quote.stat.low'), value: formats.price(quote.low) },
      { label: t('quote.stat.prevClose'), value: formats.price(quote.previous_close) },
      {
        label: t('quote.stat.volume'),
        value: formats.volume(quote.volume),
        title: formats.volumeFull(quote.volume),
      },
    ],
    [quote, t, formats],
  )

  return (
    <article key={freshKey} className="card animate-fade-up p-6 sm:p-8">
      <header className="flex items-start justify-between gap-4 flex-wrap pb-5 border-b rule">
        <div>
          <div className="label-eyebrow mb-2">{t('quote.heading')}</div>
          <h2 className="display-italic text-4xl sm:text-5xl font-medium tracking-tightest text-ink-500 dark:text-ink-50 leading-none">
            {quote.symbol}
          </h2>
          <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-ink-300 dark:text-ink-100">
            <span>{quote.market_state}</span>
            <span aria-hidden>·</span>
            {/* Zone name is supplied by Intl (EDT/EST), never hardcoded. */}
            <span>{t('quote.asOf', { time: formats.time(quote.fetched_at) })}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quote.provider === 'mock' && (
            <span
              className="label-eyebrow !text-[10px] inline-flex items-center gap-1.5 px-2 py-1 border border-gold-500/40 text-gold-600 dark:text-gold-300 bg-gold-500/8"
              title={t('quote.demoTitle')}
            >
              <span className="w-1 h-1 bg-gold-500 dark:bg-gold-400 rounded-full" />
              {t('quote.demoData')}
            </span>
          )}
          {quote.provider === 'yfinance' && (
            <span className="label-eyebrow !text-[10px] inline-flex items-center gap-1.5 px-2 py-1 border border-ink-500/15 dark:border-ink-50/15 text-ink-300 dark:text-ink-100">
              <span className="w-1 h-1 bg-forest-500 dark:bg-forest-400 rounded-full" />
              {t('quote.live')}
            </span>
          )}
        </div>
      </header>

      <div className="pt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-12 items-end">
        <div>
          <div className="num-fresh text-[60px] sm:text-[80px] md:text-[96px] leading-none font-mono font-medium tracking-tightest text-ink-500 dark:text-ink-50">
            ${formats.price(quote.price)}
          </div>
          <div className={`mt-4 flex items-baseline gap-3 num text-xl ${dirTone}`}>
            <span className="text-base" aria-hidden>
              {dirMark}
            </span>
            <span className="sr-only">
              {dir === 'up' ? 'Up' : dir === 'down' ? 'Down' : 'Flat'}
            </span>
            <span>{formats.change(quote.change)}</span>
            <span className="opacity-70">({formats.percent(quote.change_percent)})</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="btn-primary px-6 py-3 self-start md:self-end whitespace-nowrap text-sm"
        >
          {analyzing ? (
            <>
              <span className="spinner" />
              <span>
                {t('quote.analyzing')}
                <span className="inline-block animate-pulse-dot ml-1">·</span>
              </span>
            </>
          ) : (
            <>
              <span className="display-italic text-lg leading-none translate-y-[-1px]">AI</span>
              <span>{t('quote.analyze')}</span>
              <span aria-hidden>→</span>
            </>
          )}
        </button>
      </div>

      <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 border-t rule pt-5">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="label-eyebrow">{s.label}</dt>
            <dd
              className="num mt-1 text-lg sm:text-xl text-ink-500 dark:text-ink-50"
              title={s.title}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export default memo(QuoteCard)