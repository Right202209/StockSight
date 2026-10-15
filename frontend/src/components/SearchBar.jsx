import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { isValidSymbol, normalizeSymbol } from '../utils/validate'

const SUGGESTIONS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META']

function SearchBar({ onSubmit, loading, defaultSymbol = '', inputRef }) {
  const { t } = useI18n()
  const [value, setValue] = useState(defaultSymbol)
  const [touched, setTouched] = useState(false)
  // App owns the ref so it can return focus here after a failed lookup (F-10);
  // the internal one only exists so the component also works standalone.
  const innerRef = useRef(null)
  const fieldRef = inputRef || innerRef
  const valid = value === '' || isValidSymbol(value)
  const showError = touched && value !== '' && !valid

  // "/" focuses the ticker field — but only when the user is typing somewhere
  // else. Otherwise a "/" inside any input (or a cmd/ctrl shortcut) would be
  // swallowed (F-05).
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.defaultPrevented) return
      const el = e.target
      const tag = el?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable ||
        document.activeElement === fieldRef.current
      ) {
        return
      }
      e.preventDefault()
      fieldRef.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const onChange = useCallback((e) => {
    setValue(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 8))
  }, [])

  const submit = useCallback(
    (e) => {
      e?.preventDefault()
      setTouched(true)
      const sym = normalizeSymbol(value)
      if (!isValidSymbol(sym)) return
      onSubmit(sym)
    },
    [onSubmit, value],
  )

  const pickSuggestion = useCallback(
    (sym) => {
      setValue(sym)
      setTouched(true)
      onSubmit(sym)
    },
    [onSubmit],
  )

  return (
    <section className="sticky top-0 z-20 py-6 sm:py-8 border-b border-ink-500/15 dark:border-ink-50/15 bg-paper-100/85 dark:bg-ink-600/85 backdrop-blur-sm">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="symbol" className="label-eyebrow">
          {t('search.label')} ·{' '}
          <span className="font-mono normal-case">{t('search.hint')}</span>
        </label>

        <div className="flex items-stretch gap-3 flex-col sm:flex-row">
          <div className="flex-1 relative group">
            <span
              aria-hidden
              className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-ink-200 dark:text-ink-100 select-none text-lg"
            >
              $
            </span>
            <input
              id="symbol"
              ref={fieldRef}
              type="text"
              value={value}
              onChange={onChange}
              onBlur={() => setTouched(true)}
              placeholder={t('search.placeholder')}
              spellCheck="false"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              aria-keyshortcuts="/"
              className={`w-full pl-10 pr-4 py-4 bg-paper-50 dark:bg-ink-500/40 border ${
                showError
                  ? 'border-oxblood-500/60'
                  : 'border-ink-500/20 dark:border-ink-50/20 hover:border-ink-500/40 dark:hover:border-ink-50/30 focus:border-ink-500 dark:focus:border-ink-50'
              } text-2xl sm:text-3xl font-mono tracking-tight text-ink-500 dark:text-ink-50 placeholder:text-ink-200/60 dark:placeholder:text-ink-100/30 transition-colors focus-ring outline-none`}
              aria-invalid={showError}
              aria-describedby={showError ? 'symbol-error' : undefined}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !value || !valid}
            className="btn-primary px-7 py-4 text-base whitespace-nowrap"
          >
            {loading ? (
              <>
                <span className="spinner" /> {t('search.loading')}
              </>
            ) : (
              <>
                {t('search.button')} <span aria-hidden>→</span>
              </>
            )}
          </button>
        </div>

        {showError ? (
          <p
            id="symbol-error"
            role="alert"
            className="text-oxblood-500 dark:text-oxblood-400 text-sm font-medium"
          >
            {t('search.invalid')}
          </p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap text-xs text-ink-300 dark:text-ink-100">
            <span className="label-eyebrow !text-[10px]">{t('search.try')}</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickSuggestion(s)}
                disabled={loading}
                className="font-mono px-2 py-1 border border-ink-500/15 dark:border-ink-50/15 hover:bg-ink-500/5 dark:hover:bg-ink-50/10 transition-colors focus-ring disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  )
}

export default memo(SearchBar)