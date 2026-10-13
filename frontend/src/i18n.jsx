import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'stocksight-lang'
export const LANGUAGES = ['en', 'zh']

export const dict = {
  en: {
    'app.tagline': 'Read the tape. Hear the AI.',
    'app.subtitle': 'Real-time quotes, sober commentary, no hype.',
    'app.eyebrow': 'AI · Equities',
    'health.online': 'Online',
    'health.offline': 'Offline',
    'health.checking': 'Checking…',
    'lang.toggle': '中文',
    'theme.toLight': 'Switch to light mode',
    'theme.toDark': 'Switch to dark mode',
    'search.label': 'Stock symbol',
    'search.placeholder': 'Enter a US symbol, e.g. AAPL',
    'search.button': 'Get Quote',
    'search.loading': 'Fetching…',
    'search.invalid': 'Enter a valid symbol (1–5 letters).',
    'quote.heading': 'Quote',
    'quote.price': 'Price',
    'quote.change': 'Change',
    'quote.analyze': 'Analyze with AI',
    'quote.analyzing': 'Analyzing…',
    'analysis.heading': 'AI Analysis',
    'analysis.summary': 'Summary',
    'analysis.sentiment': 'Sentiment',
    'analysis.risk': 'Risk',
    'analysis.generated': 'Generated',
    'analysis.justNow': 'Just now',
    'history.heading': 'History',
    'history.empty': 'No analyses yet. Run one to see it here.',
    'error.generic': 'Something went wrong. Please try again.',
  },
  zh: {
    'app.tagline': '读懂行情，听见 AI。',
    'app.subtitle': '实时报价，冷静点评，不吹不黑。',
    'app.eyebrow': 'AI · 股票',
    'health.online': '在线',
    'health.offline': '离线',
    'health.checking': '检测中…',
    'lang.toggle': 'EN',
    'theme.toLight': '切换到浅色模式',
    'theme.toDark': '切换到深色模式',
    'search.label': '股票代码',
    'search.placeholder': '输入美股代码，如 AAPL',
    'search.button': '获取报价',
    'search.loading': '获取中…',
    'search.invalid': '请输入有效代码（1–5 个字母）。',
    'quote.heading': '报价',
    'quote.price': '价格',
    'quote.change': '涨跌',
    'quote.analyze': '用 AI 分析',
    'quote.analyzing': '分析中…',
    'analysis.heading': 'AI 分析',
    'analysis.summary': '摘要',
    'analysis.sentiment': '情绪',
    'analysis.risk': '风险',
    'analysis.generated': '生成于',
    'analysis.justNow': '刚刚',
    'history.heading': '历史',
    'history.empty': '暂无分析。运行一次即可在此查看。',
    'error.generic': '出错了，请重试。',
  },
}

const I18nContext = createContext({ lang: 'en', t: (k) => k, setLang: () => {}, toggleLang: () => {} })

function detectInitialLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (LANGUAGES.includes(stored)) return stored
  } catch {}
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detectInitialLang)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    }
  }, [lang])

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === 'en' ? 'zh' : 'en'))
  }, [])

  const t = useCallback(
    (key) => (dict[lang] && dict[lang][key]) || dict.en[key] || key,
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, toggleLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
