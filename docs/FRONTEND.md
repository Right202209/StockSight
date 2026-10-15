# 前端全景文档（Frontend Panorama）

> **文档目的**：把前端的设计意图、代码结构、视觉系统、状态流和已知缺口一次性讲清楚，使**不熟悉本仓库的 AI 或人类评审者**可以在不读完全部源码的前提下，给出准确、可落地的修改意见。
>
> **阅读方式**：第 1–4 节建立背景，第 5–7 节是设计与组件规格（改视觉/交互必读），第 8–9 节是状态与数据流（改行为必读），**第 10 节是已知缺口清单**（最直接的评审起点），第 11 节是给评审者的提问清单。
>
> 源码为运行时的唯一权威。本文描述的是 `frontend/` 在 commit `bcf3598` 时的状态。

---

## 1. 产品定位与设计语气

StockSight 前端是一个**单页、无路由、无登录**的编辑风格仪表盘（editorial dashboard）。一句话概括它的设计主张：

> 用金融报刊的排版语气（衬线斜体大标题、米色纸张、等宽数字、细分隔线），承载一个极简的 AI 股票点评工具。

这决定了后续所有取舍：

| 设计主张 | 在代码中的体现 |
|---|---|
| 报刊感而非 SaaS 感 | `Fraunces` 衬线斜体标题（`.display-italic`）、`rounded-none` 全局无圆角、`border` 细线分隔 |
| 数据即正文 | 价格用 96px 等宽数字 + `tabular-nums`，视觉优先级高于一切装饰 |
| 克制、不吹嘘 | 无渐变色块、无阴影卡片、无图表；文案反复强调 "not financial advice" |
| 纸张质感 | `paper-*` 米色系 + `body::before` 的 SVG 噪点叠加层 |
| 编辑者口吻 | `VOL. I · No. 001`、`Caveat lector ·`、`Awaiting Input` 等杂志式眉题 |

**核心用户旅程（唯一一条主流程）**：

```
输入代码 ──► 获取报价 ──► 点击 Analyze ──► 展示 AI 分析 ──►（自动）写入历史
   │                          │
   └── 校验 1-5 位字母         └── 失败时顶部 Notice 提示
```

---

## 2. 技术栈与工具链

| 项 | 版本 / 选型 | 说明 |
|---|---|---|
| 框架 | React 18.3.1 | 无路由库、无状态管理库、无数据请求库（全部手写） |
| 构建 | Vite 5.4.21 | `@vitejs/plugin-react` 4.7.0 |
| 样式 | Tailwind CSS 3.4.19 + PostCSS + autoprefixer | `darkMode: 'class'` |
| 语言 | **纯 JavaScript (JSX)，无 TypeScript** | 无 `tsconfig.json`、无类型定义 |
| 测试 | **无** | 无 vitest/jest/playwright 配置 |
| Lint/格式化 | **无** | 无 ESLint、无 Prettier 配置（源码中有一处 `// eslint-disable-next-line` 注释，但无对应配置） |
| 字体 | Google Fonts CDN（Fraunces / Inter Tight / JetBrains Mono） | `index.html:17-22` |

**后端契约**：所有数据来自 `VITE_API_BASE`（默认 `http://localhost:8000`）下的四个端点：`/api/health`、`/api/quote`、`/api/analyze`、`/api/history`。前端**从不**直接访问 LLM 或行情源。

---

## 3. 文件地图与职责

```
frontend/
├── index.html                  文档头、SEO/OG meta、favicon(data URI)、字体 CDN 链接
├── vite.config.js              仅注册 react 插件；dev server 固定 127.0.0.1:5173
├── tailwind.config.js          ★ 设计令牌唯一来源：色板/字体/字距/关键帧
├── postcss.config.js           tailwindcss + autoprefixer
├── package.json                仅 2 个运行时依赖：react、react-dom
└── src/
    ├── main.jsx                入口：在挂载前解析主题(localStorage→系统偏好)，包裹 I18nProvider
    ├── App.jsx                 ★ 唯一的容器组件：全部状态、全部编排、EmptyState/Skeleton/Notice
    ├── api.js                  fetch 封装 + ApiError（status/payload）；无重试、无取消
    ├── i18n.jsx                I18nProvider + 词典(en/zh) + useI18n（⚠️ 当前无人调用，见 §10.1）
    ├── index.css               @layer base/components：CSS 变量、噪点层、.card/.btn-*/.num 等
    ├── utils/
    │   ├── format.js           货币/百分比/成交量/时间格式化 + sentiment/direction 色调映射
    │   └── validate.js         股票代码正则（与后端 schemas.py 保持一致）
    └── components/
        ├── Masthead.jsx        报刊头版：刊名、日期、健康指示灯、主题开关
        ├── SearchBar.jsx       吸顶搜索区：输入、校验、建议代码、"/" 快捷键
        ├── QuoteCard.jsx       报价主卡：大号价格、涨跌、四项统计、Analyze 按钮
        ├── AnalysisCard.jsx    AI 分析卡：情绪徽章、引用式摘要、三项指标、免责声明
        └── HistoryPanel.jsx    右侧粘性历史列表（可点击回填）
```

**依赖方向**（严格单向，无循环）：

```
main.jsx → App.jsx → components/*、api.js、utils/*
main.jsx → i18n.jsx（Provider）
```

组件**全部是受控展示组件**：无组件内部数据请求，无 context 消费（除 i18n），所有状态由 `App` 持有。

---

## 4. 页面结构与响应式布局

### 4.1 桌面（≥1024px，`lg` 断点）

```
┌────────────────────────────────────────── max-w-7xl ──────────────────────────────────────────┐
│ Masthead ▸ StockSight (Fraunces italic 7xl) │ AI · Equities │ VOL.I·No.001  date  ●  Online  ☾ │
│ ──────────────────────────────────── border-b ──────────────────────────────────────────────── │
│ ▌ SearchBar（sticky top-0 z-20，半透明 + backdrop-blur-sm）                                     │
│   TICKER LOOKUP · PRESS / TO FOCUS                                                             │
│   [ $  AAPL                                    ]  [ Get Quote → ]                              │
│   Try: AAPL MSFT NVDA TSLA GOOGL AMZN META                                                     │
│ ─────────────────────────────────────────────────────────────────────────────────────────────  │
│  ┌──── main (1fr) ───────────────────────┐   ┌──── aside (340px, sticky top-6) ──┐            │
│  │ EmptyState 或 SkeletonCard            │   │ Recent Analyses        1 entry   │            │
│  │ QuoteCard（价格 96px / 统计 4 列）      │   │ ───────────────────────────────── │            │
│  │ AnalysisCard（金色左边框 2px）          │   │ AAPL            Oct 15, 14:02     │            │
│  │ SkeletonAnalysis（分析中且尚无结果时）   │   │ 摘要两行截断…                      │            │
│  └───────────────────────────────────────┘   │ ▲ Bullish  Risk · Low   $241.20   │            │
│                                              └───────────────────────────────────┘            │
│ ──────────────────────────────────── border-t ──────────────────────────────────────────────── │
│ StockSight · An editorial trading companion · MVP build        NOT FINANCIAL ADVICE            │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 断点行为

| 断点 | 变化 |
|---|---|
| `< sm (640px)` | 主网格单列；搜索框与按钮纵向堆叠；`$` 前缀在输入框内；Masthead 隐藏 `AI · Equities`；健康指示灯 `hidden sm:inline-flex` |
| `< md (768px)` | Masthead 隐藏 `VOL. I · No. 001`；QuoteCard 统计从 4 列降至 2 列 |
| `< lg (1024px)` | 侧栏从右列落到主列下方，取消 sticky |
| 全局 | 页面左右内边距 `px-5 → sm:px-8 → lg:px-12` |

### 4.3 视觉与动效令牌（`tailwind.config.js`）

| 类别 | 令牌 | 值 / 用途 |
|---|---|---|
| 纸（浅色底） | `paper-50/100/200/300` | `#FAF6EE` 卡片 → `#F4EFE6` 页面 → `#EBE4D6` → `#DDD3BE` |
| 墨（文字/深色底） | `ink-50 … ink-600` | `ink-500 = #1A1A18` 主文字，`ink-600 = #0E0E0C` 深色页面底 |
| 跌 | `oxblood-400/500/600` | `#A8413D / #7A1F1F / #5C1414` |
| 涨 | `forest-400/500/600` | `#3A8056 / #1F5C3E / #143F2A` |
| 中性/强调 | `gold-400/500/600` | `#C19E47 / #A6802C / #7D5F1F`（Neutral 情绪、Demo Data 徽章、分析卡左边框） |
| 字号 | `display-italic`、`.label-eyebrow`、`.num`、`tracking-tightest (-0.04em)` | 标题斜体衬线；10px 大写字距 `.18em` 眉题；等宽数字 + `tnum lnums` |
| 动效 | `fade-up` / `fade-in` / `pulse-dot` / `num-arrive` / `spin` | 入场 0.5s cubic-bezier(.2,.8,.2,1)；骨架屏 1.4s 呼吸；价格数字 0.5s 位移淡入 |

**复用类**（`index.css` 的 `@layer components`）：`.card`（半透明纸面 + 极细边框 + `backdrop-blur-[2px]`）、`.btn-primary`、`.btn-ghost`、`.rule`（分隔线颜色）、`.marker`（左竖线引用块）、`.focus-ring`、`.num`、`.display-italic`、`.label-eyebrow`。

**暗色模式**：`darkMode: 'class'`，切换写在 `document.body` 上（`App.jsx:34`），初值在 `main.jsx:7-14` 于挂载前解析（localStorage → `prefers-color-scheme`），避免闪烁。

---

## 5. 组件规格

### 5.1 `App.jsx`（容器，244 行）

| Props | `initialTheme: 'light' | 'dark'` |
|---|---|

持有的全部状态：

| 状态 | 类型 | 语义 |
|---|---|---|
| `theme` | `'light' \| 'dark'` | 与 `body.dark` class 同步写入 |
| `healthy` | `null \| true \| false` | 后端可达性；`null` = 检测中 |
| `quote` | `object \| null` | 当前报价（后端 `QuoteData` 形状） |
| `analysis` | `object \| null` | 当前分析（后端返回 + `id`） |
| `activeHistoryId` | `string \| null` | 高亮历史项 |
| `loadingQuote` / `loadingAnalyze` / `loadingHistory` | `bool` | 三个独立加载态 |
| `history` | `array` | 最近 20 条（`App.jsx:50` 硬编码） |
| `notice` | `{text, tone, key} \| null` | 顶部错误提示，6s 自动消失（`flash()`，`App.jsx:25-29`） |

关键编排逻辑：

- **`handleQuote`（60-83）**：清空 `analysis` 与 `activeHistoryId` → 请求报价 → 失败时若 `status === 0` 额外把 `healthy` 置为 `false` 并提示"后端是否在 :8000 运行"。捕获 `AbortError` 并静默返回（但见 §10.5：`signal` 实际从未传入）。
- **`handleAnalyze`（85-102）**：以当前 `quote` 整体作为 `quote_data` POST，成功后把 `data.id` 设为 `activeHistoryId` 并刷新历史。502 有专门文案。
- **`handleHistorySelect`（104-115）**：用历史项的 `quote_data` 回填报价卡，并**合成**一个 analysis 对象（`ai_summary → summary`），然后平滑滚回顶部。注意这里复用 `analysis` 状态，因此"历史回看"与"新分析"在视图上不可区分（见 §10.6）。
- **首屏副作用（41-45）**：并行触发健康检查与历史拉取。

内置的四个同文件子组件：`EmptyState`（首次进入的空态）、`SkeletonCard`、`SkeletonAnalysis`、`Notice`（`role="alert"` + 手动关闭）。

### 5.2 `Masthead.jsx`

| Props | `theme`、`onToggleTheme`、`healthy` |
|---|---|

- 日期每分钟自刷新一次（`setInterval 60_000`），格式 `Wednesday, October 15, 2026`。
- `HealthDot`：`healthy === null` 灰点、"Checking…"；`true` 绿点；`false` 红点，均带 `animate-pulse-dot`。
- `ThemeToggle`：36×36 无圆角按钮，图标 `☾`（浅色时）/`☼`（深色时）。
- ⚠️ 刊名下方标语、`AI · Equities`、`VOL. I · No. 001`、健康灯文案**全部硬编码英文**，未接 i18n；`aria-label` 也是写死的 `Switch to light/dark mode`。

### 5.3 `SearchBar.jsx`

| Props | `onSubmit(symbol)`、`loading`、`defaultSymbol` |
|---|---|

- 本地状态：`value`、`touched`；校验为"空字符串也算合法"（`valid = value === '' || isValidSymbol(value)`），仅 `touched && 非空 && 非法` 才显示错误。
- 输入即 `toUpperCase()` 并 `slice(0, 8)`（8 = 5 字母 + `.` + 2 位后缀，与正则上限一致）。
- 全局 `/` 键聚焦（`SearchBar.jsx:13-22`），但**不判断是否在输入框内**、也没有 `Escape` 失焦。
- 建议代码 `SUGGESTIONS = ['AAPL','MSFT','NVDA','TSLA','GOOGL','AMZN','META']` **硬编码在组件内**，点击即搜。
- 纵向用 `sticky top-0 z-20` + `bg-paper-100/85 backdrop-blur-sm` 吸顶。
- ⚠️ 按钮文案 `Get Quote`、加载文案 `Fetching…`、错误提示、`Try:` 前缀均硬编码英文。

### 5.4 `QuoteCard.jsx`

| Props | `quote`、`onAnalyze`、`analyzing`、`freshKey` |
|---|---|

- 三段结构：header（代码 + `market_state` + `as of HH:MM:SS UTC` + 数据源徽章）、主体（96px 价格 + 涨跌行 + Analyze 按钮）、`<dl>` 四项统计（Day High / Day Low / Prev Close / Volume）。
- 数据源徽章：`provider === 'mock'` → 金色 "Demo Data"（tooltip 解释 Y! 不可用）；`provider === 'yfinance'` → "Yahoo Live"。
- 涨跌方向由 `directionOf()` 判定，映射到 `forest / oxblood / ink` 色调与 `▲ ▼ –` 符号。
- 成交量为紧凑格式（`1.2M`），`title` 属性给出完整数字。
- ⚠️ 所有 label 硬编码；`key={freshKey}` 写在组件返回的根元素上（见 §10.4）。

### 5.5 `AnalysisCard.jsx`

| Props | `analysis`、`symbol`、`freshKey` |
|---|---|

- 左边框 `border-l-2` 金色，与报价卡形成视觉层级差。
- 情绪徽章由 `toneOf(sentiment)` 驱动（Bullish→forest、Bearish→oxblood、Neutral→gold，同时决定底/边/字色与 `▲▼◆` 标记）。
- 摘要以 `.marker`（左竖线）+ 衬线斜体 3xl 呈现，等效于杂志的**引文块**。
- 三项指标：Sentiment / Risk Level / Generated（无 `created_at` 时显示 `Just now`）。
- 卡内固定免责声明 `Caveat lector ·`，文案硬编码。
- ⚠️ 未展示该分析对应的报价快照（价格、时间），回看历史时无法确认分析基于哪一档行情。

### 5.6 `HistoryPanel.jsx`

| Props | `items`、`loading`、`onSelect(item)`、`activeId` |
|---|---|

- `<aside>` 在 `lg` 以上 `sticky top-6` 且 `max-h-[calc(100vh-3rem)]` 可滚动。
- 每条：代码（衬线斜体）+ 时间 → 两行截断摘要（`line-clamp-2`）→ 情绪徽章 + `Risk · X` + 右侧价格与涨跌幅。
- 标题区显示条目数，且有单复数处理（`1 entry / N entries`）。
- 选中项以背景色区分（`bg-ink-500/5`），**无 `aria-current` 或任何无障碍标记**。
- ⚠️ 无分页、无按代码过滤、无删除（后端 `/api/history` 已支持 `symbol` 与 `limit≤100`，前端未使用）。

### 5.7 `api.js`

- 单一 `request()` 泛化封装：自动 JSON 序列化、`res.text()` 后尝试解析、非 2xx 时按 `payload.error → payload.detail → Request failed (status)` 逐级取错误文案。
- 网络异常（非 `AbortError`）统一抛 `ApiError(status: 0)` —— 这是 `App` 区分"后端没起来"与"业务报错"的唯一依据。
- 导出的门面：`api.health()` / `api.quote(symbol, signal)` / `api.analyze(symbol, quote_data, signal)` / `api.history(limit = 20, signal)`。
- ⚠️ 无超时、无重试、无请求取消；`signal` 形参存在但无调用方传值。

### 5.8 `i18n.jsx` 与 `utils/`

- `i18n.jsx`：提供 `LANGUAGES=['en','zh']`、约 20 条键的词典、`detectInitialLang()`（localStorage → `navigator.language`）、`I18nProvider`（同步 `localStorage` 与 `<html lang>`）、`useI18n()`。
- `format.js`：`Intl.NumberFormat('en-US')` 常驻，价格两位小数、百分比 `signDisplay:'exceptZero'`、成交量 `notation:'compact'`；时间一律 UTC 且 `hour12:false`。另有 `SENTIMENT_TONES` 与 `directionTone` 两张样式映射表。
- `validate.js`：`SYMBOL_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/`，与后端 `backend/schemas.py:8` 完全一致（**双份真相，改一处必须改另一处**）。

---

## 6. 状态机与交互时序

```
        ┌──────────────┐
        │  EmptyState  │  quote=null, loadingQuote=false
        └──────┬───────┘
   submit      │  handleQuote
               ▼
        ┌──────────────┐  失败 → Notice(红/黄) → 回到 EmptyState（healthy=false 时点亮红灯）
        │ SkeletonCard │
        └──────┬───────┘
               ▼
        ┌──────────────────────┐
        │ QuoteCard            │  analysis=null
        │  [ AI Analyze → ]    │
        └──────┬───────────────┘
   click       │  handleAnalyze（loadingAnalyze=true，analysis 仍为 null → 显示 SkeletonAnalysis）
               ▼
        ┌──────────────────────┐
        │ QuoteCard +          │  成功：setAnalysis(data)、activeHistoryId=data.id、refreshHistory()
        │ AnalysisCard         │  失败(502)：Notice「模型可能不可达」
        └──────┬───────────────┘
               │ 点击历史项
               ▼
        QuoteCard(item.quote_data) + AnalysisCard(由历史项合成) + 高亮该项 + 滚回顶部
```

**异步时序上的两个真实并发窗口**（详见 §10.5）：连续快速提交两次查询时，后发的请求不保证先返回，旧响应可能覆盖新状态；`refreshHistory` 在分析成功后以"即发即忘"方式调用，期间用户仍可点击历史项。

---

## 7. 无障碍（a11y）现状

已做到：

- 语义标签：`header` / `main` / `aside` / `article` / `dl-dt-dd` / `ol` / `footer`。
- 表单：`<label htmlFor="symbol">`、`aria-invalid`、`aria-describedby` 指向错误段落、`id="symbol-error"`。
- `Notice` 使用 `role="alert"`；错误提示按钮有 `aria-label="Dismiss"`。
- 全站 `.focus-ring`（`:focus-visible` 双色 ring + offset，深浅两套色）。
- 主题切换按钮有 `aria-label`；`<html lang>` 会随语言状态同步。
- 装饰性 `$` 前缀与箭头符号标了 `aria-hidden`。

待改进（评审可直接引用）：

- `aria-live="polite"` 挂在 `QuoteCard` 的根 `article` 上（`QuoteCard.jsx:36`），但该节点**随内容一起挂载**，屏幕阅读器通常在节点出现后才注册 live region，播报可能不生效 —— 更可靠的做法是把 live region 放在常驻容器上。
- 主题切换按钮的 `aria-label` 硬编码英文（`Masthead.jsx:73`），未复用 i18n 的 `theme.toLight/theme.toDark`。
- 历史列表选中项无 `aria-current`。
- 全局键盘快捷键 `/` 不区分输入焦点上下文。
- 无 `prefers-reduced-motion` 处理：`fade-up`、`num-arrive`、无限 `pulse-dot` 在系统要求减弱动效时仍会播放。
- 无跳过导航链接（Skip to content）。

---

## 8. 数据契约（前端视角）

前端消费的响应形状（后端 `schemas.py` 为准）：

```jsonc
// GET /api/quote  → QuoteData
{
  "symbol": "AAPL", "price": 241.2, "change": 1.4, "change_percent": 0.58,
  "high": 243.1, "low": 238.9, "volume": 12345678, "previous_close": 239.8,
  "market_state": "REGULAR", "fetched_at": "2026-10-15T14:02:11Z",
  "provider": "yfinance"        // 或 "mock" —— 前端据此显示徽章
}

// POST /api/analyze  ← { symbol, quote_data: QuoteData }
//              → { id, summary, sentiment, risk_level }
//   sentiment ∈ {"Bullish","Neutral","Bearish"}，前端据此选色调与符号

// GET /api/history?limit=20 → { items: [{ id, symbol, quote_data, ai_summary,
//                                          sentiment, risk_level, created_at }] }

// GET /api/health → { status: "ok" }
```

**持久化只发生在 `/api/analyze`**：仅"被分析过的报价"进入历史，`/api/quote` 不写库。前端的历史面板因此是分析档案而非查询记录 —— 这一点决定了历史项**总是**携带完整 `quote_data`，也是"点击历史即回填报价卡"能成立的原因。

---

## 9. 已知缺口清单（评审起始点）

按建议处理优先级排序。每条都标注了位置与可验证的现象。

### 9.1 ⚠️ i18n 已接线但完全未使用（最高优先级的一致性缺口）

`main.jsx:18` 已经包裹 `I18nProvider`，`i18n.jsx` 有完整的中英词典（20+ 键）、语言探测、`<html lang>` 同步逻辑 —— 但**没有任何组件调用 `useI18n()`**（全仓库 `grep useI18n` 仅命中定义文件自身）。后果：

1. 界面 100% 硬编码英文，中文用户完全看不到中文；
2. `Masthead` 里**根本没有语言切换按钮**，词典中的 `lang.toggle`（`i18n.jsx:15,44`）无处调用；
3. `format.js` 全部写死 `'en-US'`，即使语言切到 zh，日期/数字格式仍为美式；
4. 词典中的键（`app.tagline`、`search.*`、`analysis.*` 等）与实际硬编码文案是**两份并行真相**，容易长期背离。

> 评审建议方向：要么补完（新增 `LangToggle`、逐组件替换字面量、`format.js` 接受 locale），要么明确降级为"预留能力"并在 `docs/` 标注，避免半成品状态。

### 9.2 关键状态缺失导致的功能空白

| 缺口 | 位置 | 影响 |
|---|---|---|
| 无 URL / 路由状态 | 全局 | 刷新丢结果（只剩历史）、无法分享某个代码的链接、无法深链 |
| 无请求取消 | `App.jsx:66,89` 调用时未传 `signal` | 快速连点可致旧响应覆盖新结果（`api.js` 已支持 `signal`） |
| 无自动刷新 / 轮询 | `QuoteCard` | 报价只有 `as of HH:MM:SS UTC` 静态时间戳，无"现在是否已过期"的提示 |
| 无 ErrorBoundary | `main.jsx:16-22` | 任一组件抛错即整页白屏 |
| 历史无过滤/分页/删除 | `HistoryPanel` + `App.jsx:50` | 后端已支持 `symbol` 与 `limit≤100`，前端固定 20 条 |
| 无"重新分析"语义区分 | `App.jsx:104-115` | 历史回看复用 `analysis` 状态，无法判断眼前这张卡是新生成的还是回填的 |

### 9.3 视觉/交互层可挑之处

| 项 | 位置 | 说明 |
|---|---|---|
| 粘性侧栏被吸顶搜索栏遮挡 | `HistoryPanel.jsx:5` (`lg:top-6`) vs `SearchBar.jsx:39` (`sticky top-0`, 高约 120–150px) | `top-6 (24px)` 小于搜索栏高度，滚动时历史面板顶部会钻到半透明搜索栏下方。建议改用与搜索栏等高的 offset |
| `key={freshKey}` 可能无效 | `QuoteCard.jsx:34`、`AnalysisCard.jsx:7` | `key` 写在**组件自己返回的根元素**上，React 的协调由父级决定身份，该 key 通常被忽略 ⇒ `num-arrive` / `fade-up` 动画可能不会在数据更新时重播。需实测确认 |
| 空态与骨架屏互斥逻辑 | `App.jsx:128-129` | `!quote && !loadingQuote` 与 `loadingQuote` 两分支并列，改状态机时容易遗漏分支 |
| 硬编码建议代码列表 | `SearchBar.jsx:4` | 若后端支持更多标的，需要维护；也不随 i18n/市场变化 |
| 字体走 Google CDN | `index.html:17-22` | 无自托管、无 SRI、渲染阻塞、离线不可用、隐私与 CSP 合规问题 |
| 噪点覆盖层 + 每卡 backdrop-blur | `index.css:34-48`、`.card` | `position: fixed` 的全屏 SVG turbulence 叠加 + 每张卡独立模糊，移动端/低端设备有合成开销 |
| 动画无减弱动效降级 | 全站 | 见 §7 |
| 对比度未验证 | `ink-200` 占位符、10px 眉题 | `placeholder:text-ink-200/60`、`label-eyebrow` 的 10px 字号，建议用对比度工具实测是否达 WCAG AA |
| 表单无 `<html>` 级 `lang` 变化时的字体回退 | `--` | 中文回退到系统 sans，与 `Inter Tight` 的排版节奏不同，需专门审视中文排版 |

### 9.4 工程化缺口

- **零测试**（无单测、无组件测试、无 E2E），无 CI 配置。
- **无类型系统**：`QuoteData` / `HistoryItem` 的形状只存在于后端 `schemas.py` 与前端人的记忆里，`api.js` 的返回值为隐式 `any`。
- **无 lint/format**：无 ESLint/Prettier 配置，风格靠人工维持。
- **符号正则双份定义**：`frontend/src/utils/validate.js:1` ↔ `backend/schemas.py:8`，无共享来源（如 OpenAPI 生成）。
- **无加载/错误边界的统一抽象**：三个 `loadingX` 布尔 + 内联 `Notice` 逻辑在 `App.jsx` 内手写，随着端点增加会线性膨胀。
- **API 响应无统一信封**：错误靠 `payload.error`/`payload.detail` 双路径猜测，成功路径无 `success` 字段。

---

## 10. 扩展点与约定

如果要动手改，请遵守以下既有约定，以保持风格一致：

1. **视觉改动**：色值、字体、字距、动画只能加在 `tailwind.config.js`；不要写散落的十六进制。重复出现的组合抽到 `index.css` 的 `@layer components`（如 `.card`、`.btn-*`）。
2. **新组件**：放 `src/components/`，纯展示、受控 props、无内部请求；数据编排一律回 `App.jsx`。
3. **文案**：新文案请**同时**写进 `i18n.jsx` 词典并（在 i18n 补完前）以字面量呈现，避免第三份真相。
4. **数字/日期**：一律经过 `utils/format.js`，不要在组件里 `toFixed`。
5. **改造契约**：任何触及 `/api/analyze` 请求体形状的改动，必须同步检查 `docs/API.md`、`docs/PROMPT.md` 与后端 `schemas.py`。
6. **风格取向**：继续拒绝圆角、阴影、渐变、图标库；用字重、字距、细线和留白建立层级。

---

## 11. 给评审者（AI 或人类）的提问清单

请针对以下问题给出**具体到文件与行**的意见，而不是泛泛的设计建议：

**架构与状态**
1. `App.jsx` 目前是单一容器持有 9 个状态与 3 个加载标记，是否应引入 `useReducer` 或一个轻量 hook（如 `useStockSight()`）来收敛状态转移？值得吗？
2. `handleHistorySelect` 用合成的伪 analysis 复用展示层，这个取舍是否合理？若要区分"回看"与"新生成"，最小改动是什么？
3. 引入 URL 状态（如 `?symbol=AAPL`）的成本与收益，是否应优先于其他改动？

**i18n（§9.1）**
4. 补完 i18n 与"删除半成品"两条路线，你倾向哪条？给出可执行的迁移步骤与风险。

**视觉与体验**
5. `key={freshKey}` 失效的判断是否成立？请给出一段最小验证方法。
6. `lg:top-6` 与吸顶搜索栏的重叠如何修最干净（CSS 变量、`scroll-margin`、还是布局重构）？
7. 价格 96px 的数字排版在 375px 宽度下是否溢出？`tracking-tightest` 与 `tabular-nums` 的组合有无隐患？
8. 现有一套纸/墨/涨/跌/中性的色板，是否满足 WCAG AA？哪些具体组合不达标？

**工程质量**
9. 在"无 TS、无测试、无 lint"的前提下，若要投入一天做一件事，你建议先补哪一项？为什么？
10. `validate.js:1` 与 `schemas.py:8` 的双份正则，最好的单一真相方案是什么（OpenAPI 生成 / 共享 JSON Schema / 构建期校验）？
11. 前端 `/api/history` 只用 `limit=20`，后端已支持 `symbol` 过滤与 `limit≤100`。历史面板的下一步演进（过滤、分页、删除）哪一个最值？

---

## 12. 参考

- [Architecture](ARCHITECTURE.md) — 前后端整体请求流与存储适配器
- [API reference](API.md) — 端点契约与冒烟测试
- [Prompt contract](PROMPT.md) — LLM 输出契约与校验
- [Configuration](CONFIGURATION.md) — `VITE_API_BASE` 等环境变量
- 根 [CLAUDE.md](../CLAUDE.md) — 项目约束与"两次调用"流程说明

> 本文随前端行为变化同步更新。改动组件 props、状态、断点或色板时，请一并修改对应小节。
