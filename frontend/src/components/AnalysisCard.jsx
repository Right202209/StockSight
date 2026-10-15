import { memo, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { toneOf } from '../utils/format'

function AnalysisCard({ analysis, symbol, freshKey }) {
  const { t, formats } = useI18n()
  const tone = toneOf(analysis.sentiment)
  const headingRef = useRef(null)

  // Move focus to the result heading so keyboard/screen-reader users land on
  // the new content instead of staying on the button they just pressed (F-10).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [freshKey])

  return (
    <article
      key={freshKey}
      className="card animate-fade-up p-6 sm:p-8 border-l-2 border-l-gold-500/60 dark:border-l-gold-400/50"
    >
      <header className="flex items-start justify-between gap-4 flex-wrap pb-5 border-b rule">
        <div>
          <div className="label-eyebrow mb-2">
            {t('analysis.heading')} · {symbol}
          </div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="display-italic text-3xl sm:text-4xl font-medium tracking-tightest text-ink-500 dark:text-ink-50 leading-tight focus-ring outline-none"
          >
            {t('analysis.title')}
          </h3>
        </div>

        <span
          className={`inline-flex items-baseline gap-2 px-3 py-1.5 border ${tone.border} ${tone.bg} ${tone.text} font-medium tracking-tight text-sm`}
        >
          <span className="text-xs translate-y-[-1px]" aria-hidden>
            {tone.mark}
          </span>
          {tone.label}
        </span>
      </header>

      <div className="pt-6 marker">
        <p className="display-italic text-2xl sm:text-3xl leading-snug text-ink-500 dark:text-ink-50 tracking-tight">
          &ldquo;{analysis.summary}&rdquo;
        </p>
      </div>

      <div className="mt-7 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 border-t rule pt-5">
        <Stat label={t('analysis.sentiment')} value={analysis.sentiment} tone={tone.text} />
        <Stat label={t('analysis.risk')} value={analysis.risk_level} />
        <Stat
          label={t('analysis.generated')}
          value={analysis.created_at ? formats.dateTime(analysis.created_at) : t('analysis.justNow')}
        />
      </div>

      <Disclaimer />
    </article>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`mt-1 text-lg font-medium tracking-tight ${tone || 'text-ink-500 dark:text-ink-50'}`}>
        {value}
      </div>
    </div>
  )
}

function Disclaimer() {
  const { t } = useI18n()
  return (
    <p className="mt-6 pt-5 border-t rule text-[11px] tracking-wide text-ink-300 dark:text-ink-100 leading-relaxed">
      <span className="display-italic text-sm not-italic font-medium text-ink-400 dark:text-ink-50">
        Caveat lector ·
      </span>{' '}
      {t('analysis.caveat')}
    </p>
  )
}

export default memo(AnalysisCard)