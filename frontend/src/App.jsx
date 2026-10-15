import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { useI18n } from './i18n'
import Masthead from './components/Masthead'
import SearchBar from './components/SearchBar'
import QuoteCard from './components/QuoteCard'
import AnalysisCard from './components/AnalysisCard'
import HistoryPanel from './components/HistoryPanel'

const HISTORY_LIMIT = 20

export default function App({ initialTheme }) {
  const { t } = useI18n()
  const [theme, setTheme] = useState(initialTheme)
  const [healthy, setHealthy] = useState(null)

  const [quote, setQuote] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [activeHistoryId, setActiveHistoryId] = useState(null)

  const [loadingQuote, setLoadingQuote] = useState(false)
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const quoteRequest = useRef(null) // current AbortController for quote fetches
  const searchInputRef = useRef(null) // so a failed lookup can return focus (F-10)
  // The quote/analyze responses are keyed by the symbol they belong to. Any
  // state write checks this ref so a slow response can never clobber whatever
  // the user is looking at now (F-01).
  const currentSymbol = useRef(null)

  const flash = useCallback((message, tone = 'error') => {
    setNotice({ message, tone, key: Date.now() })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      try {
        localStorage.setItem('stocksight-theme', next)
      } catch {}
      return next
    })
  }, [])

  const refreshHistory = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingHistory(true)
      try {
        const data = await api.history(HISTORY_LIMIT)
        setHistory(data.items || [])
      } catch (e) {
        if (silent) return
        flash(t('error.generic'), 'warn')
      } finally {
        if (!silent) setLoadingHistory(false)
      }
    },
    [flash, t],
  )

  // Initial health + history fetch (health tolerates the cold-start timeout).
  useEffect(() => {
    api.health().then(() => setHealthy(true)).catch(() => setHealthy(false))
    refreshHistory()
    return () => {
      quoteRequest.current?.abort()
      clearTimeout(noticeTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleQuote = useCallback(
    async (symbol) => {
      // Cancel any in-flight quote request, then supersede it.
      quoteRequest.current?.abort()
      const ctrl = new AbortController()
      quoteRequest.current = ctrl
      currentSymbol.current = symbol

      setLoadingQuote(true)
      setAnalysis(null) // never show an analysis from a different symbol
      setActiveHistoryId(null)
      setNotice(null)
      try {
        const data = await api.quote(symbol, { signal: ctrl.signal })
        setQuote(data)
        setHealthy(true)
      } catch (e) {
        if (e?.name === 'AbortError') return // superseded — ignore silently
        setQuote(null)
        setAnalysis(null)
        flash(
          e instanceof ApiError && e.status === 0
            ? t('error.network')
            : t('error.quote') + ': ' + (e.message || ''),
        )
        if (e instanceof ApiError && e.status === 0) setHealthy(false)
        // Put the caret back in the ticker field so retrying is one keypress (F-10).
        searchInputRef.current?.focus()
      } finally {
        // Only the request that is still current may clear the flag. An older,
        // superseded fetch's `finally` must not turn loading off while the new
        // symbol is still in flight (F-01).
        if (quoteRequest.current === ctrl) setLoadingQuote(false)
      }
    },
    [flash, t],
  )

  const handleAnalyze = useCallback(async () => {
    if (!quote || loadingAnalyze) return // double-click guard (F-01)

    const symbol = quote.symbol
    setLoadingAnalyze(true)
    setNotice(null)
    try {
      const res = await api.analyze({ symbol, quote_data: quote })
      // The server persisted it regardless of what the user does next; if they
      // have moved on, it appears in history rather than under a mismatch.
      if (currentSymbol.current === symbol) {
        setAnalysis(res)
        setActiveHistoryId(res.id)
      }
      // Build the new history row locally — the analyze response carries the
      // id and server created_at, so no extra round-trip is needed (F-04).
      setHistory((h) =>
        [
          {
            id: res.id,
            symbol,
            quote_data: quote,
            ai_summary: res.summary,
            sentiment: res.sentiment,
            risk_level: res.risk_level,
            created_at: res.created_at,
          },
          ...h.filter((x) => x.id !== res.id),
        ].slice(0, HISTORY_LIMIT),
      )
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (currentSymbol.current === symbol) {
          setAnalysis(null)
          return handleQuote(symbol) // quote went stale — silently re-fetch
        }
        return
      }
      flash(
        e instanceof ApiError && e.status === 502
          ? t('error.llm')
          : t('error.analyze') + ': ' + (e.message || ''),
      )
    } finally {
      setLoadingAnalyze(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, loadingAnalyze, handleQuote, flash, t])

  const handleHistorySelect = useCallback((item) => {
    setQuote(item.quote_data)
    currentSymbol.current = item.symbol
    setAnalysis({
      id: item.id,
      summary: item.ai_summary,
      sentiment: item.sentiment,
      risk_level: item.risk_level,
      created_at: item.created_at,
    })
    setActiveHistoryId(item.id)
    setNotice(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleDataRefresh = useCallback(
    (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        refreshHistory({ silent: true })
      }
    },
    [refreshHistory],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleDataRefresh)
    return () => window.removeEventListener('keydown', handleDataRefresh)
  }, [handleDataRefresh])

  return (
    <div className="min-h-screen px-5 sm:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <Masthead theme={theme} onToggleTheme={toggleTheme} healthy={healthy} />

        <SearchBar
          onSubmit={handleQuote}
          loading={loadingQuote}
          inputRef={searchInputRef}
        />

        {notice && <Notice key={notice.key} notice={notice} onDismiss={() => setNotice(null)} />}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 lg:gap-12 py-8">
          <main className="space-y-8 min-w-0">
            {!quote && !loadingQuote && <EmptyState />}
            {loadingQuote && <SkeletonCard />}

            {quote && (
              <QuoteCard
                quote={quote}
                onAnalyze={handleAnalyze}
                analyzing={loadingAnalyze}
                freshKey={`${quote.symbol}-${quote.fetched_at}`}
              />
            )}

            {analysis && (
              <AnalysisCard
                analysis={analysis}
                symbol={quote?.symbol || currentSymbol.current || ''}
                freshKey={analysis.id || analysis.summary}
              />
            )}

            {loadingAnalyze && !analysis && <SkeletonAnalysis />}
          </main>

          <HistoryPanel
            items={history}
            loading={loadingHistory}
            onSelect={handleHistorySelect}
            activeId={activeHistoryId}
          />
        </div>

        <footer className="border-t rule mt-6 py-7 text-[11px] tracking-wide text-ink-300 dark:text-ink-100 flex items-center justify-between flex-wrap gap-3">
          <span>
            <span className="display-italic text-sm">StockSight</span> · {t('app.credit')}
          </span>
          <span className="font-mono uppercase tracking-wider">{t('app.disclaimer')}</span>
        </footer>
      </div>
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  const [headline, sub] = t('empty.title').split(' / ')
  return (
    <div className="card animate-fade-in p-10 sm:p-14 text-center">
      <p className="label-eyebrow">{t('empty.eyebrow')}</p>
      <h2 className="mt-3 display-italic text-4xl sm:text-5xl text-ink-500 dark:text-ink-50 tracking-tightest leading-tight">
        {headline}
        <br />
        {sub}
      </h2>
      <p className="mt-5 max-w-md mx-auto text-ink-400 dark:text-ink-100 leading-relaxed">
        {t('empty.body')}
      </p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card p-8 animate-pulse-dot">
      <div className="h-3 w-24 bg-ink-200/30 dark:bg-ink-50/10 mb-4" />
      <div className="h-12 w-40 bg-ink-200/30 dark:bg-ink-50/10 mb-6" />
      <div className="h-20 w-64 bg-ink-200/30 dark:bg-ink-50/10" />
    </div>
  )
}

function SkeletonAnalysis() {
  return (
    <div className="card p-6 sm:p-8 animate-pulse-dot" aria-hidden>
      <div className="flex items-center justify-between pb-5 border-b rule">
        <div className="h-7 w-56 bg-ink-200/30 dark:bg-ink-50/10" />
        <div className="h-6 w-20 bg-ink-200/30 dark:bg-ink-50/10" />
      </div>
      <div className="pt-6 space-y-3">
        <div className="h-6 w-full bg-ink-200/30 dark:bg-ink-50/10" />
        <div className="h-6 w-4/5 bg-ink-200/30 dark:bg-ink-50/10" />
      </div>
      <div className="mt-7 grid grid-cols-3 gap-6 border-t rule pt-5">
        <div className="h-10 bg-ink-200/30 dark:bg-ink-50/10" />
        <div className="h-10 bg-ink-200/30 dark:bg-ink-50/10" />
        <div className="h-10 bg-ink-200/30 dark:bg-ink-50/10" />
      </div>
    </div>
  )
}

function Notice({ notice, onDismiss }) {
  const { t } = useI18n()
  const tone =
    notice.tone === 'warn'
      ? 'border-gold-500/40 text-gold-600 dark:text-gold-300 bg-gold-500/8'
      : 'border-oxblood-500/40 text-oxblood-500 dark:text-oxblood-400 bg-oxblood-500/8'

  return (
    <div
      role="alert"
      className={`mt-4 flex items-start gap-3 border ${tone} px-4 py-3 text-sm animate-fade-up`}
    >
      <span className="display-italic text-base leading-none translate-y-[2px]">!</span>
      <p className="flex-1">{notice.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 font-mono text-xs px-2 focus-ring"
        aria-label={t('notice.dismiss')}
      >
        ✕
      </button>
    </div>
  )
}