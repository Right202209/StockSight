import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import Masthead from './components/Masthead'
import SearchBar from './components/SearchBar'
import QuoteCard from './components/QuoteCard'
import AnalysisCard from './components/AnalysisCard'
import HistoryPanel from './components/HistoryPanel'

export default function App({ initialTheme }) {
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

  const flash = useCallback((text, tone = 'error') => {
    setNotice({ text, tone, key: Date.now() })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.body.classList.toggle('dark', next === 'dark')
      try { localStorage.setItem('stocksight-theme', next) } catch {}
      return next
    })
  }

  // Initial health + history fetch
  useEffect(() => {
    api.health().then(() => setHealthy(true)).catch(() => setHealthy(false))
    refreshHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await api.history(20)
      setHistory(data.items || [])
    } catch (e) {
      // Non-fatal; show a soft notice
      flash(`History unavailable: ${e.message}`, 'warn')
    } finally {
      setLoadingHistory(false)
    }
  }, [flash])

  const handleQuote = useCallback(
    async (symbol) => {
      setLoadingQuote(true)
      setAnalysis(null)
      setActiveHistoryId(null)
      try {
        const data = await api.quote(symbol)
        setQuote(data)
        setHealthy(true)
      } catch (e) {
        if (e.name === 'AbortError') return
        setQuote(null)
        flash(
          e instanceof ApiError && e.status === 0
            ? 'Cannot reach the backend. Is the FastAPI server running on :8000?'
            : `Quote failed: ${e.message}`,
        )
        if (e instanceof ApiError && e.status === 0) setHealthy(false)
      } finally {
        setLoadingQuote(false)
      }
    },
    [flash],
  )

  const handleAnalyze = useCallback(async () => {
    if (!quote) return
    setLoadingAnalyze(true)
    try {
      const data = await api.analyze(quote.symbol, quote)
      setAnalysis(data)
      setActiveHistoryId(data.id)
      refreshHistory()
    } catch (e) {
      flash(
        e instanceof ApiError && e.status === 502
          ? 'AI analysis failed. The model may be unreachable — please try again.'
          : `Analyze failed: ${e.message}`,
      )
    } finally {
      setLoadingAnalyze(false)
    }
  }, [quote, refreshHistory, flash])

  const handleHistorySelect = useCallback((item) => {
    setQuote(item.quote_data)
    setAnalysis({
      id: item.id,
      summary: item.ai_summary,
      sentiment: item.sentiment,
      risk_level: item.risk_level,
    })
    setActiveHistoryId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div className="min-h-screen px-5 sm:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <Masthead theme={theme} onToggleTheme={toggleTheme} healthy={healthy} />

        <SearchBar onSubmit={handleQuote} loading={loadingQuote} />

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
                symbol={quote?.symbol || ''}
                freshKey={analysis.id || analysis.summary}
              />
            )}
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
            <span className="display-italic text-sm">StockSight</span>{' '}
            · An editorial trading companion · MVP build
          </span>
          <span className="font-mono uppercase tracking-wider">
            Not financial advice
          </span>
        </footer>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card animate-fade-in p-10 sm:p-14 text-center">
      <p className="label-eyebrow">Awaiting Input</p>
      <h2 className="mt-3 display-italic text-4xl sm:text-5xl text-ink-500 dark:text-ink-50 tracking-tightest leading-tight">
        Type a ticker.
        <br />
        We&rsquo;ll read it for you.
      </h2>
      <p className="mt-5 max-w-md mx-auto text-ink-400 dark:text-ink-100 leading-relaxed">
        Live US equity quotes, paired with sober one-sentence AI commentary
        and a structured sentiment / risk read.
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

function Notice({ notice, onDismiss }) {
  const tone =
    notice.tone === 'warn'
      ? 'border-gold-500/40 text-gold-500 dark:text-gold-400 bg-gold-500/8'
      : 'border-oxblood-500/40 text-oxblood-500 dark:text-oxblood-400 bg-oxblood-500/8'

  return (
    <div
      role="alert"
      className={`mt-4 flex items-start gap-3 border ${tone} px-4 py-3 text-sm animate-fade-up`}
    >
      <span className="display-italic text-base leading-none translate-y-[2px]">!</span>
      <p className="flex-1">{notice.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 font-mono text-xs px-2 focus-ring"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
