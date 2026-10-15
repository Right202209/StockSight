import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { makeFormatters } from './utils/format'

const STORAGE_KEY = 'stocksight-lang'
export const LANGUAGES = ['en', 'zh']

export const dict = {
  en: {
    'app.eyebrow': 'AI · Equities',
    'app.tagline': 'Read the tape. Hear the AI.',
    'app.subtitle': 'Real-time quotes, sober commentary, no hype.',
    'app.volume': 'VOL. I · No. 001',
    'app.credit': 'An editorial trading companion · MVP build',
    'app.disclaimer': 'Not financial advice',

    'health.online': 'Online',
    'health.offline': 'Offline',
    'health.checking': 'Checking…',
    'lang.toggle': '中文',
    'lang.aria': 'Switch language',
    'theme.toLight': 'Switch to light mode',
    'theme.toDark': 'Switch to dark mode',

    'search.label': 'Ticker Lookup',
    'search.hint': 'Press / to focus',
    'search.placeholder': 'AAPL',
    'search.button': 'Get Quote',
    'search.loading': 'Fetching…',
    'search.invalid': 'Symbol must be 1–5 uppercase letters (e.g. AAPL, BRK.A).',
    'search.try': 'Try:',

    'empty.eyebrow': 'Awaiting Input',
    'empty.title': 'Type a ticker. / We’ll read it for you.',
    'empty.body':
      'Live US equity quotes, paired with sober one-sentence AI commentary and a structured sentiment / risk read.',

    'quote.heading': 'Current Quote',
    // `{time}` carries its own live zone abbreviation (EDT/EST) from Intl, so
    // the label itself stays zone-free (F-09).
    'quote.asOf': 'as of {time}',
    'quote.demoData': 'Demo Data',
    'quote.demoTitle':
      'Yahoo Finance is unavailable from this environment — showing deterministic demo data',
    'quote.live': 'Yahoo Live',
    'quote.analyze': 'Analyze',
    'quote.analyzing': 'Analyzing',
    'quote.stat.high': 'Day High',
    'quote.stat.low': 'Day Low',
    'quote.stat.prevClose': 'Prev Close',
    'quote.stat.volume': 'Volume',

    'analysis.heading': 'AI Commentary',
    'analysis.title': 'What the model sees',
    'analysis.sentiment': 'Sentiment',
    'analysis.risk': 'Risk Level',
    'analysis.generated': 'Generated',
    'analysis.justNow': 'Just now',
    'analysis.caveat': 'Not financial advice — for informational use only. AI commentary may be incomplete, inaccurate, or hallucinated. Independently verify before trading.',

    'history.heading': 'Recent Analyses',
    'history.count_one': '{n} entry',
    'history.count_other': '{n} entries',
    'history.empty.pre': 'No analyses yet. Search a ticker and tap',
    'history.empty.action': 'AI Analyze',
    'history.empty.post': 'to start the archive.',
    'history.risk': 'Risk · {value}',
    'history.loading': 'Loading history…',

    'notice.dismiss': 'Dismiss',
    'error.generic': 'Something went wrong. Please try again.',
    'error.network': 'Cannot reach the backend. It may be waking up — retry in a moment.',
    'error.quote': 'Quote failed',
    'error.analyze': 'Analyze failed',
    'error.llm': 'AI analysis failed. The model may be unreachable — please try again.',
  },
  zh: {
    'app.eyebrow': 'AI · 股票',
    'app.tagline': '读懂行情，听见 AI。',
    'app.subtitle': '实时报价，冷静点评，不吹不黑。',
    'app.volume': '第一卷 · 第 001 期',
    'app.credit': '一份编辑式交易手册 · MVP 版本',
    'app.disclaimer': '非投资建议',

    'health.online': '在线',
    'health.offline': '离线',
    'health.checking': '检测中…',
    'lang.toggle': 'EN',
    'lang.aria': '切换语言',
    'theme.toLight': '切换到浅色模式',
    'theme.toDark': '切换到深色模式',

    'search.label': '股票代码',
    'search.hint': '按 / 聚焦输入框',
    'search.placeholder': 'AAPL',
    'search.button': '获取报价',
    'search.loading': '获取中…',
    'search.invalid': '请输入有效代码（1–5 个字母，如 AAPL、BRK.A）。',
    'search.try': '试试：',

    'empty.eyebrow': '等待输入',
    'empty.title': '输入一个代码。 / 我们替你解读。',
    'empty.body': '美股实时报价，配上一句冷静的 AI 点评，以及结构化的情绪 / 风险判断。',

    'quote.heading': '报价',
    // `{time}` 自带 Intl 生成的实时时区缩写（EDT/EST）。
    'quote.asOf': '截至 {time}',
    'quote.demoData': '演示数据',
    'quote.demoTitle': '当前环境无法访问 Yahoo Finance —— 展示的是确定性演示数据',
    'quote.live': 'Yahoo 实时',
    'quote.analyze': 'AI 分析',
    'quote.analyzing': '分析中',
    'quote.stat.high': '当日最高',
    'quote.stat.low': '当日最低',
    'quote.stat.prevClose': '前收盘',
    'quote.stat.volume': '成交量',

    'analysis.heading': 'AI 点评',
    'analysis.title': '模型看到了什么',
    'analysis.sentiment': '情绪',
    'analysis.risk': '风险等级',
    'analysis.generated': '生成于',
    'analysis.justNow': '刚刚',
    'analysis.caveat': '非投资建议，仅供信息参考。AI 点评可能不完整、不准确或为幻觉所生，交易前请自行核实。',

    'history.heading': '最近分析',
    'history.count_one': '{n} 条',
    'history.count_other': '{n} 条',
    'history.empty.pre': '暂无分析。搜索一个代码并点击',
    'history.empty.action': 'AI 分析',
    'history.empty.post': '开始建立档案。',
    'history.risk': '风险 · {value}',
    'history.loading': '正在加载历史…',

    'notice.dismiss': '关闭',
    'error.generic': '出错了，请重试。',
    'error.network': '无法连接后端，可能正在唤醒，请稍后重试。',
    'error.quote': '获取报价失败',
    'error.analyze': '分析失败',
    'error.llm': 'AI 分析失败，模型可能不可用，请重试。',
  },
}

// Used only if a component renders outside the provider (e.g. a test).
const DEFAULT_FORMATS = {
  price: (v) => String(v),
  change: (v) => String(v),
  percent: (v) => String(v),
  volume: (v) => String(v),
  volumeFull: (v) => String(v),
  dateTime: (v) => String(v ?? ''),
  time: (v) => String(v ?? ''),
  longDate: () => '',
}

const I18nContext = createContext({
  lang: 'en',
  t: (k) => k,
  setLang: () => {},
  toggleLang: () => {},
  formats: DEFAULT_FORMATS,
})

function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

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
    (key, vars) => {
      // Dev-only drift guard so the two dictionaries can't silently diverge.
      if (import.meta.env.DEV && !(key in dict[lang])) {
        console.warn(`[i18n] missing key "${key}" for lang="${lang}"`)
      }
      const template = dict[lang]?.[key] ?? dict.en[key] ?? key
      return interpolate(template, vars)
    },
    [lang],
  )

  // Locale-aware formatters, rebuilt only when the language changes (F-08/F-09).
  const formats = useMemo(() => makeFormatters(lang), [lang])

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, formats }),
    [lang, toggleLang, t, formats],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
