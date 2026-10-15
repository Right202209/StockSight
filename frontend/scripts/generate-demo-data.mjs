#!/usr/bin/env node
/**
 * Generates `src/demo/dataset.js` — the fixed sample set behind the GitHub
 * Pages gallery (see frontend/gallery.html and the pages workflow).
 *
 * Why hand-authored numbers instead of calling the API: the gallery is a
 * static snapshot with no backend, and it must be identical on every build.
 * A generator that hit `/api/quote` + `/api/analyze` would produce different
 * data on every run, embed a live API URL in the bundle, and break offline.
 *
 * The output is committed, so this script exists to make the data reviewable
 * and regenerable — run `npm run gen:demo` after editing SOURCES below.
 *
 * Two constraints the output must respect (see backend/schemas.py):
 *   - every quote parses as a `QuoteData` (finite numbers, volume >= 0,
 *     `provider` in {yfinance, mock}),
 *   - every analysis parses as a `HistoryItem` (sentiment is exactly one of
 *     Bullish | Neutral | Bearish).
 * `npm run build:pages` runs this script, so a malformed edit fails the build
 * rather than shipping a broken page.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'demo', 'dataset.js')

// End of the most recent regular session. Fixed on purpose: the snapshot is
// the same wherever and whenever it is built.
const MARKET_CLOSE = '2026-10-15T20:00:07Z'
const SPACING_MINUTES = 7

/**
 * The sample set. One entry = one row exactly as `GET /api/history` would
 * return it (`quote_data` is the raw `QuoteData` payload), plus `name`,
 * `name_zh`, `sector` and `ai_summary_zh` for the gallery's display only.
 *
 * Summaries are written, not model-generated, and are deliberately sober —
 * they demonstrate the *shape* of the contract (one sentence, a sentiment, a
 * risk level), not a live opinion on any company.
 */
const SOURCES = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    name_zh: '苹果公司',
    sector: 'Technology',
    price: 231.42,
    previous_close: 229.1,
    high: 232.51,
    low: 228.66,
    volume: 48_213_900,
    sentiment: 'Bullish',
    risk_level: 'Medium',
    ai_summary:
      'Apple closed higher on above-average volume, holding above its prior close for the whole session. The momentum is constructive, but the shares stay sensitive to any weakening in consumer demand.',
    ai_summary_zh:
      '苹果在高于均值的成交量中收涨，全天基本运行于前收盘之上。动能偏正面，但股价对消费需求走弱仍较敏感。',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    name_zh: '微软',
    sector: 'Technology',
    price: 418.76,
    previous_close: 421.33,
    high: 423.1,
    low: 417.02,
    volume: 21_455_300,
    sentiment: 'Neutral',
    risk_level: 'Low',
    ai_summary:
      'Microsoft drifted modestly lower in a quiet session, giving back a small part of its recent advance. The move reads as routine drift rather than a change in the underlying story.',
    ai_summary_zh:
      '微软在清淡交投中小幅回落，回吐了近期涨势的一小部分。这更像是常规波动，而非基本面叙事生变。',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    name_zh: '英伟达',
    sector: 'Semiconductors',
    price: 187.94,
    previous_close: 179.55,
    high: 189.2,
    low: 180.44,
    volume: 312_884_000,
    sentiment: 'Bullish',
    risk_level: 'High',
    ai_summary:
      'NVIDIA rallied sharply on the heaviest volume of the group, extending its run as a market leader. The move is powerful, but the valuation leaves little room for a disappointing quarter.',
    ai_summary_zh:
      '英伟达以全场最高成交量大幅上涨，延续领涨势头。涨势强劲，但估值已难容一份不及预期的财报。',
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    name_zh: '特斯拉',
    sector: 'Automobiles',
    price: 244.18,
    previous_close: 251.02,
    high: 252.4,
    low: 242.91,
    volume: 98_764_500,
    sentiment: 'Bearish',
    risk_level: 'High',
    ai_summary:
      'Tesla sold off through the session and finished near its low, a sign that sellers stayed in control. Both the trend and the stock’s volatility argue for caution.',
    ai_summary_zh:
      '特斯拉全天走低并以接近日内低点收盘，显示卖方占据主动。趋势与波动性都提示需要谨慎。',
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    name_zh: 'Alphabet',
    sector: 'Communication Services',
    price: 197.63,
    previous_close: 195.88,
    high: 198.44,
    low: 195.61,
    volume: 27_318_400,
    sentiment: 'Bullish',
    risk_level: 'Medium',
    ai_summary:
      'Alphabet advanced steadily and closed in the upper half of its daily range. The move is orderly, and advertising revenue remains the swing factor to watch.',
    ai_summary_zh:
      'Alphabet 稳步上行，收于日内区间上半部。走势有序，广告收入仍是关键的观察变量。',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    name_zh: '亚马逊',
    sector: 'Consumer Discretionary',
    price: 218.37,
    previous_close: 216.99,
    high: 219.55,
    low: 216.4,
    volume: 39_571_200,
    sentiment: 'Neutral',
    risk_level: 'Medium',
    ai_summary:
      'Amazon eked out a modest gain on unremarkable volume, leaving it range-bound. Neither the bulls nor the bears have made a convincing case this month.',
    ai_summary_zh:
      '亚马逊在平淡的成交量中小幅收涨，整体仍在区间内震荡。本月多空双方均未占据明显优势。',
  },
  {
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    name_zh: 'Meta 平台',
    sector: 'Communication Services',
    price: 612.05,
    previous_close: 604.77,
    high: 615.3,
    low: 603.12,
    volume: 15_982_600,
    sentiment: 'Bullish',
    risk_level: 'Medium',
    ai_summary:
      'Meta finished higher after recovering an early dip, keeping its uptrend intact. Spending on AI infrastructure is the main question mark in the outlook.',
    ai_summary_zh:
      'Meta 收复早盘跌幅后收高，上升趋势保持不变。AI 基础设施支出是前景中的主要不确定因素。',
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    name_zh: '摩根大通',
    sector: 'Financials',
    price: 259.44,
    previous_close: 261.8,
    high: 262.15,
    low: 258.9,
    volume: 9_447_800,
    sentiment: 'Neutral',
    risk_level: 'Low',
    ai_summary:
      'JPMorgan slipped slightly in light trading, a muted reaction for a large-cap bank. Credit conditions and the rate path are the variables that matter from here.',
    ai_summary_zh:
      '摩根大通在清淡交投中小幅走低，对一家大型银行而言反应温和。信贷环境与利率路径是后续的关键变量。',
  },
  {
    symbol: 'XOM',
    name: 'Exxon Mobil Corporation',
    name_zh: '埃克森美孚',
    sector: 'Energy',
    price: 112.86,
    previous_close: 110.42,
    high: 113.4,
    low: 110.61,
    volume: 18_236_900,
    sentiment: 'Bullish',
    risk_level: 'Medium',
    ai_summary:
      'Exxon gained firmly alongside firmer crude prices. The move is tied to commodities, so it would unwind just as quickly if energy prices turn.',
    ai_summary_zh:
      '埃克森美孚随原油价格走强而上扬。该走势与大宗商品挂钩，若能源价格回落也会同样迅速地回吐。',
  },
  {
    symbol: 'PFE',
    name: 'Pfizer Inc.',
    name_zh: '辉瑞',
    sector: 'Health Care',
    price: 24.71,
    previous_close: 25.62,
    high: 25.7,
    low: 24.55,
    volume: 42_109_700,
    sentiment: 'Bearish',
    risk_level: 'High',
    ai_summary:
      'Pfizer fell sharply and closed near its session low, under clear distribution. A stock making new lows on expanding volume warrants a defensive stance.',
    ai_summary_zh:
      '辉瑞大幅下跌并收于日内低点附近，抛压明显。在放量创新低的情况下，宜采取防御姿态。',
  },
  {
    symbol: 'KO',
    name: 'The Coca-Cola Company',
    name_zh: '可口可乐',
    sector: 'Consumer Staples',
    price: 71.35,
    previous_close: 70.96,
    high: 71.62,
    low: 70.88,
    volume: 12_884_100,
    sentiment: 'Neutral',
    risk_level: 'Low',
    ai_summary:
      'Coca-Cola nudged higher in a narrow range, behaving as a defensive holding should. There is little here to excite either side of the trade.',
    ai_summary_zh:
      '可口可乐在狭窄区间内小幅走高，符合防御性持仓的表现。无论多空都缺乏兴奋点。',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices, Inc.',
    name_zh: '超威半导体',
    sector: 'Semiconductors',
    price: 168.52,
    previous_close: 164.2,
    high: 169.88,
    low: 164.01,
    volume: 61_455_300,
    sentiment: 'Bullish',
    risk_level: 'High',
    ai_summary:
      'AMD rose on strong volume, tracking the broader rally in semiconductors. That high beta cuts both ways once sentiment in the sector cools.',
    ai_summary_zh:
      'AMD 在强劲成交中上涨，跟随芯片板块整体走强。一旦板块情绪降温，其高贝塔属性会双向放大波动。',
  },
]

const SENTIMENTS = new Set(['Bullish', 'Neutral', 'Bearish'])
const round = (n, dp) => Number(n.toFixed(dp))

function buildQuote(source) {
  const change = round(source.price - source.previous_close, 4)
  const changePercent = round((change / source.previous_close) * 100, 4)
  return {
    symbol: source.symbol,
    price: source.price,
    change,
    change_percent: changePercent,
    high: source.high,
    low: source.low,
    volume: source.volume,
    previous_close: source.previous_close,
    market_state: 'CLOSED',
    fetched_at: MARKET_CLOSE,
    // "mock" is honest — and it makes QuoteCard render its "Demo Data" badge,
    // so a viewer is told the numbers are not a live feed.
    provider: 'mock',
  }
}

function buildEntry(source, index) {
  if (!SENTIMENTS.has(source.sentiment)) {
    throw new Error(`${source.symbol}: bad sentiment ${source.sentiment}`)
  }
  // Newest first: the gallery renders the array in order, and the in-app
  // history panel lists most recent at the top.
  const createdAt = new Date(
    new Date(MARKET_CLOSE).getTime() - index * SPACING_MINUTES * 60_000,
  ).toISOString()

  return {
    id: `demo-${source.symbol.toLowerCase()}`,
    symbol: source.symbol,
    quote_data: buildQuote(source),
    ai_summary: source.ai_summary,
    ai_summary_zh: source.ai_summary_zh,
    sentiment: source.sentiment,
    risk_level: source.risk_level,
    created_at: createdAt,
    // Display-only extras; ignored by the app's `HistoryItem` consumer.
    name: source.name,
    name_zh: source.name_zh,
    sector: source.sector,
  }
}

/** Fail the build if the generated data would not satisfy the API schemas. */
function assertShape(entry) {
  const q = entry.quote_data
  const finite = ['price', 'change', 'change_percent', 'high', 'low', 'previous_close']
  for (const key of finite) {
    if (!Number.isFinite(q[key])) throw new Error(`${entry.symbol}: ${key} is not finite`)
  }
  if (!Number.isInteger(q.volume) || q.volume < 0) {
    throw new Error(`${entry.symbol}: volume must be a non-negative integer`)
  }
  if (!['yfinance', 'mock'].includes(q.provider)) {
    throw new Error(`${entry.symbol}: provider must be yfinance or mock`)
  }
  if (q.symbol !== entry.symbol) throw new Error(`${entry.symbol}: symbol mismatch`)
  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(entry.symbol)) {
    throw new Error(`${entry.symbol}: does not match the backend symbol pattern`)
  }
  if (!entry.ai_summary?.trim() || entry.ai_summary.length > 500) {
    throw new Error(`${entry.symbol}: ai_summary must be 1..500 chars`)
  }
  if (!entry.risk_level?.trim() || entry.risk_level.length > 50) {
    throw new Error(`${entry.symbol}: risk_level must be 1..50 chars`)
  }
  // Gaps happen: a gap-up day's low can sit above previous_close. The one real
  // invariant is that the day range contains the close (price), not prev close.
  if (q.high < q.price || q.low > q.price || q.high <= q.low) {
    throw new Error(`${entry.symbol}: day range must contain the close price`)
  }
  return entry
}

const entries = SOURCES.map(buildEntry).map(assertShape)

if (new Set(entries.map((e) => e.symbol)).size !== entries.length) {
  throw new Error('duplicate symbols in SOURCES')
}

const banner = `// GENERATED FILE — do not edit by hand.
// Source: frontend/scripts/generate-demo-data.mjs. Regenerate with \`npm run gen:demo\`.
// Snapshot of the ${new Date(MARKET_CLOSE).toISOString().slice(0, 10)} session close.

/** Sample rows shaped exactly like \`GET /api/history\` items. */
`

const body = `export const DEMO_ANALYSES = ${JSON.stringify(entries, null, 2)}

/** Session date the snapshot was taken from — shown in the gallery header. */
export const DEMO_AS_OF = ${JSON.stringify(MARKET_CLOSE)}
`

writeFileSync(OUT, banner + body, 'utf8')
console.log(`wrote ${OUT} (${entries.length} entries)`)
