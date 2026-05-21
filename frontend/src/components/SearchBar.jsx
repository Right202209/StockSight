import { useEffect, useRef, useState } from 'react'
import { isValidSymbol, normalizeSymbol } from '../utils/validate'

const SUGGESTIONS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META']

export default function SearchBar({ onSubmit, loading, defaultSymbol = '' }) {
  const [value, setValue] = useState(defaultSymbol)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef(null)
  const valid = value === '' || isValidSymbol(value)
  const showError = touched && value !== '' && !valid

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = (e) => {
    e?.preventDefault()
    setTouched(true)
    const sym = normalizeSymbol(value)
    if (!isValidSymbol(sym)) return
    onSubmit(sym)
  }

  const pickSuggestion = (sym) => {
    setValue(sym)
    setTouched(true)
    onSubmit(sym)
  }

  return (
    <section className="py-6 sm:py-8 border-b border-ink-500/15 dark:border-ink-50/15">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="symbol" className="label-eyebrow">
          Ticker Lookup · Press <span className="font-mono normal-case">/</span> to focus
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
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase().slice(0, 8))}
              onBlur={() => setTouched(true)}
              placeholder="AAPL"
              spellCheck="false"
              autoComplete="off"
              inputMode="text"
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
            disabled={loading || !value}
            className="btn-primary px-7 py-4 text-base whitespace-nowrap"
          >
            {loading ? (
              <>
                <span className="spinner" /> Fetching…
              </>
            ) : (
              <>Get Quote <span aria-hidden>→</span></>
            )}
          </button>
        </div>

        {showError ? (
          <p id="symbol-error" className="text-oxblood-500 dark:text-oxblood-400 text-sm font-medium">
            Symbol must be 1–5 uppercase letters (e.g. AAPL, BRK.A).
          </p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap text-xs text-ink-300 dark:text-ink-100">
            <span className="label-eyebrow !text-[10px]">Try:</span>
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
