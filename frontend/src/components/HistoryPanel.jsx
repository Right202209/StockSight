import { memo } from 'react'
import { useI18n } from '../i18n'
import { directionOf, directionTone, toneOf } from '../utils/format'

function HistoryPanel({ items, loading, onSelect, activeId }) {
  const { t } = useI18n()

  return (
    <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-baseline justify-between gap-3 pb-3 border-b rule">
        <h3 className="display-italic text-2xl font-medium tracking-tightest text-ink-500 dark:text-ink-50">
          {t('history.heading')}
        </h3>
        <span className="label-eyebrow" aria-live="polite">
          {loading
            ? '…'
            : t(items.length === 1 ? 'history.count_one' : 'history.count_other', {
                n: items.length,
              })}
        </span>
      </div>

      {items.length === 0 && !loading && (
        <p className="mt-5 text-sm text-ink-300 dark:text-ink-100 leading-relaxed">
          {t('history.empty.pre')}{' '}
          <span className="font-medium text-ink-400 dark:text-ink-50">
            {t('history.empty.action')}
          </span>{' '}
          {t('history.empty.post')}
        </p>
      )}

      <ol className="mt-2 divide-y rule">
        {items.map((item) => (
          <HistoryRow
            key={item.id}
            item={item}
            isActive={item.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </ol>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-300 dark:text-ink-100">
          <span className="spinner" /> {t('history.loading')}
        </div>
      )}
    </aside>
  )
}

// Memoized so a new analysis only re-renders the row that changed (and not the
// other 19) — `onSelect`, `t` and `formats` are stable per language.
function HistoryRow({ item, isActive, onSelect }) {
  const { t, formats } = useI18n()
  const tone = toneOf(item.sentiment)
  const q = item.quote_data || {}
  const dir = directionOf(q.change)
  const dirTone = directionTone(dir)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${item.symbol} · ${tone.label} · ${t('analysis.risk')} ${item.risk_level}`}
        className={`w-full text-left py-4 flex flex-col gap-1.5 transition-colors focus-ring ${
          isActive
            ? 'bg-ink-500/5 dark:bg-ink-50/10'
            : 'hover:bg-ink-500/[0.03] dark:hover:bg-ink-50/[0.04]'
        } -mx-2 px-2`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="display-italic text-xl tracking-tightest text-ink-500 dark:text-ink-50">
            {item.symbol}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-300 dark:text-ink-100">
            {formats.dateTime(item.created_at)}
          </span>
        </div>

        <p className="text-sm text-ink-400 dark:text-ink-100 leading-snug line-clamp-2">
          {item.ai_summary}
        </p>

        <div className="mt-1 flex items-center gap-3 text-[11px]" aria-hidden>
          <span
            className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 border ${tone.border} ${tone.text} ${tone.bg} font-medium`}
          >
            <span className="text-[9px] translate-y-[-1px]">{tone.mark}</span>
            {tone.label}
          </span>
          <span className="font-mono text-ink-300 dark:text-ink-100">
            {t('history.risk', { value: item.risk_level })}
          </span>
          {Number.isFinite(q.price) && (
            <span className={`font-mono ml-auto ${dirTone}`}>
              ${formats.price(q.price)} ({formats.percent(q.change_percent)})
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

export default memo(HistoryPanel)