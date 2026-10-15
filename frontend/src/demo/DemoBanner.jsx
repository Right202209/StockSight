import { useI18n } from '../i18n'

/**
 * Static-demo notice, rendered above the app's masthead on the GitHub Pages
 * build only (see src/pages-demo.jsx).
 *
 * The app already labels mock quotes and disclaims AI output, but neither
 * says "this page has no backend and the numbers are a frozen sample". A
 * viewer arriving from a README link could otherwise read the quote card as
 * live. Sits outside <App /> so the product UI stays untouched.
 */
const COPY = {
  en: {
    tag: 'Static demo',
    body: 'Sample data from a single past session — no backend, no live prices, nothing saved. Run it locally for real quotes and AI analysis.',
  },
  zh: {
    tag: '静态演示',
    body: '数据取自过去某个交易日的样本快照 —— 无后端、无实时行情、不保存任何记录。本地运行可获得真实报价与 AI 分析。',
  },
}

export default function DemoBanner() {
  const { lang } = useI18n()
  const { tag, body } = COPY[lang] || COPY.en

  return (
    <div className="relative z-30 border-b border-gold-500/30 bg-gold-500/8 text-gold-600 dark:text-gold-300">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-2.5 flex items-baseline gap-3 flex-wrap">
        <span className="label-eyebrow !text-gold-600 dark:!text-gold-300 whitespace-nowrap">
          {tag}
        </span>
        <p className="text-xs leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
