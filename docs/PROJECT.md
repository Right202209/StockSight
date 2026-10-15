# 项目全景文档（Project Panorama）

> **文档目的**：用一篇文档讲清楚 StockSight 是什么、仓库里每个文件干什么、前后端各自如何组织、以及一次用户操作在两端之间如何流动。适合作为**新接手者或评审者的第一份读物**。
>
> **权威性**：源码是运行时行为的唯一权威。本文描述的是当前 `main` 分支（前端侧对应 commit `bcf3598`）的状态；若行为有变，请同步更新本文。
>
> **相关文档**：接口细节见 [API.md](API.md)，架构时序见 [ARCHITECTURE.md](ARCHITECTURE.md)，前端设计系统见 [FRONTEND.md](FRONTEND.md)，提示词契约见 [PROMPT.md](PROMPT.md)。

---

## 1. 一句话概括

StockSight 是一个**极简的全栈美股点评工具**：输入一个美股代码 → 拉取最新报价 → 调用 LLM 生成结构化点评（摘要 / 情绪 / 风险等级）→ 把成功的分析落库，并在右侧历史面板中回看。

前端是单页、无路由、无登录的编辑风格仪表盘；后端是一个只有 6 个 Python 文件的 FastAPI 服务。**所有第三方密钥（OpenAI、Supabase）只存在于后端**，前端从不直接访问 LLM 或行情源。

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + Vite 5 + Tailwind CSS 3（纯 JS/JSX，无 TypeScript） |
| 后端 | FastAPI on Python 3.12 |
| 行情 | `yfinance`，失败时回退到确定性 mock 数据 |
| LLM | OpenAI 兼容的 Chat Completions，默认 `gpt-4o-mini`，`temperature=0.2` + `response_format=json_object` |
| 存储 | 本地 SQLite / 生产 Supabase（Postgres） |
| 部署 | Render Blueprint（一个 Python Web 服务 + 一个静态站点） |

---

## 2. 完整项目树

```
StockSight/
├── README.md                        英文项目说明（简介 + 快速开始 + 文档索引）
├── README.zh-CN.md                  中文项目说明
├── LICENSE                          MIT 许可证
├── CLAUDE.md                        给 Claude Code 的项目指引（含"两次调用"流程与不可动的契约）
├── CONTRIBUTING.md                  贡献指南
├── CODE_OF_CONDUCT.md               行为准则
├── SECURITY.md                      仓库级安全策略（漏洞上报通道）
├── SUPPORT.md                       支持渠道说明
├── .gitignore                       忽略 .venv/ node_modules/ dist/ *.db .env 等
├── render.yaml                      Render Blueprint：后端 Web 服务 + 前端静态站点
│
├── backend/                         FastAPI 后端（6 个模块，扁平结构，无包）
│   ├── main.py                      应用入口：路由、CORS、安全响应头、启动生命周期
│   ├── config.py                    环境变量配置（pydantic-settings）+ SQLite 路径解析
│   ├── schemas.py                   Pydantic 模型与股票代码规范化/校验
│   ├── quote.py                     行情获取：yfinance + mock 回退 + 30 秒内存缓存
│   ├── analyze.py                   LLM 调用：提示词、JSON 解析、结果校验
│   ├── db.py                        存储适配层：SQLite / Supabase 双实现 + 分发
│   ├── requirements.txt             精确锁定的 Python 依赖
│   └── .env.example                 后端环境变量模板（含注释说明）
│
├── frontend/                        React 前端
│   ├── index.html                   文档头、SEO/OG meta、data-URI favicon、字体 CDN
│   ├── package.json                 依赖与脚本（dev / build / preview），锁定 Node 20 / npm 10
│   ├── package-lock.json            锁文件（配合 `npm ci` 使用）
│   ├── vite.config.js               仅注册 React 插件；dev server 固定 127.0.0.1:5173
│   ├── tailwind.config.js           ★ 设计令牌唯一来源：色板 / 字体 / 字距 / 动画
│   ├── postcss.config.js            tailwindcss + autoprefixer
│   ├── .env.example                 前端环境变量模板（VITE_API_BASE）
│   └── src/
│       ├── main.jsx                 React 挂载点、初始主题探测、包裹 I18nProvider
│       ├── App.jsx                  ★ 顶层状态容器：编排全部子组件与业务流程
│       ├── api.js                   后端 HTTP 客户端（fetch 封装 + ApiError）
│       ├── i18n.jsx                 中英文词典与 I18nProvider / useI18n
│       ├── index.css                Tailwind 入口 + 自定义组件类 / 纸张噪点 / 动画
│       ├── components/
│       │   ├── Masthead.jsx         页眉：报头、日期、健康指示灯、主题切换
│       │   ├── SearchBar.jsx        代码输入框、校验、建议标签、`/` 快捷键
│       │   ├── QuoteCard.jsx        报价卡：大号价格、涨跌、日高/日低/昨收/成交量
│       │   ├── AnalysisCard.jsx     AI 分析卡：摘要引言、情绪徽章、风险/时间、免责声明
│       │   └── HistoryPanel.jsx     右侧历史列表：可点击回看历史分析
│       └── utils/
│           ├── format.js            数字/日期格式化 + 情绪与涨跌的视觉色调映射
│           └── validate.js          股票代码正则与规范化（前端第一道校验）
│
├── supabase/
│   └── migrations/
│       └── 0001_init.sql            stock_analyses 建表 + 索引 + 启用 RLS
│
└── docs/                            详细文档目录
    ├── README.md                    文档索引与约定
    ├── README.zh-CN.md              中文文档索引
    ├── API.md                       接口参考（请求/响应/错误码/curl 冒烟测试）
    ├── ARCHITECTURE.md              请求流、模块职责、缓存与存储取舍
    ├── CONFIGURATION.md             前后端环境变量表与运行时基线
    ├── PROMPT.md                    LLM 提示词契约与校验路径
    ├── DEPLOYMENT.md                Supabase 迁移 + Render Blueprint 步骤
    ├── SECURITY.md                  已实现的安全控制与发布前阻塞项
    ├── TROUBLESHOOTING.md           启动、行情源、模型、部署常见故障排查
    ├── PRD.md                       产品需求：用户故事、数据流、风险、里程碑
    ├── REQUIREMENTS.md              实现需求：已交付行为与待加固项
    ├── FRONTEND.md                  前端全景文档（设计语气、组件规格、状态流、已知缺口）
    └── PROJECT.md                   ← 本文
```

> 说明：`.agents/` 与 `.codex/` 是本地工具留下的空目录，未纳入 git 跟踪，不属于项目内容。

---

## 3. 后端

后端刻意保持扁平：6 个模块放在 `backend/` 根下，用**直接 import**（`from analyze import ...`）而非包名。因此所有后端命令必须在 `backend/` 目录下执行——`config.py` 按**当前工作目录**加载 `.env`。

### 3.1 模块职责

| 文件 | 职责 | 关键内容 |
|---|---|---|
| `main.py` | 应用装配与 HTTP 边界 | 4 个路由、CORS、安全响应头中间件、`lifespan` 启动时初始化 DB |
| `config.py` | 配置单一来源 | `Settings`（pydantic-settings，读 `.env`）、`cors_origin_list`、`sqlite_path`、`get_settings()`（`lru_cache` 单例） |
| `schemas.py` | 数据契约 | `normalize_symbol()`、`QuoteData`、`AnalyzeRequest`、`AnalysisResult`、`HistoryItem` |
| `quote.py` | 行情获取 | `fetch_quote()`、yfinance 实现、确定性 mock、TTL 内存缓存 |
| `analyze.py` | LLM 调用 | `SYSTEM_PROMPT`、`USER_TEMPLATE`、`analyze_quote()`、`AnalysisError` |
| `db.py` | 存储适配 | SQLite 与 Supabase 两套实现，按 `STORAGE_BACKEND` 分发 |

### 3.2 接口一览（`main.py`）

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/api/health` | 返回 `{"status":"ok"}`，同时作为 Render 健康检查路径 |
| `GET` | `/api/quote?symbol=AAPL` | 规范化代码 → 取行情 → 返回 `QuoteData`。非法代码 `400`，行情不可用 `502` |
| `POST` | `/api/analyze` | 校验 `symbol` 与 `quote_data.symbol` 一致（否则 `400`）→ 调 LLM → **落库** → 返回 `{id, summary, sentiment, risk_level}`。LLM 失败 `502` |
| `GET` | `/api/history?symbol=&limit=` | 返回最近的分析，`limit` 范围 1–100，默认 20 |

关键的边界设计：

- **落库只发生在 `/api/analyze`**，`/api/quote` 不写库——只有被分析过的报价才会留存。
- 校验后的分析通过 `insert_analysis()` 写入，`row_id` 与 LLM 结果一起返回，前端据此高亮历史项。
- FastAPI 自动在 `/docs` 与 `/openapi.json` 暴露交互式文档。
- 中间件为每个响应补上 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。

### 3.3 行情模块（`quote.py`）

`fetch_quote(symbol)` 的决策顺序：

1. **查缓存**：进程内 `dict` + `threading.Lock`，TTL 由 `QUOTE_CACHE_TTL` 控制（默认 30 秒）。
2. **按 `STOCK_DATA_PROVIDER` 选源**：
   - `mock` → 直接返回确定性 mock；
   - `yfinance`（默认）→ 调 `yf.Ticker(symbol).fast_info`，若抛异常则**降级到 mock** 并记录 warning。
3. 结果写回缓存后返回。

`mock` 不是随机数：它以 `sha256(symbol)` 为种子推导价格与成交量，因此**同一个代码每次返回相同数据**，UI 表现稳定可复现。产物中 `provider` 字段（`"yfinance" | "mock"`）与 `market_state`（`"REGULAR" | "MOCK"`）会透传给前端，前端的 `QuoteCard` 据此显示 "Yahoo Live" 或 "Demo Data" 徽章。

### 3.4 LLM 模块（`analyze.py`）

**输出契约是承重结构**，由三层独立防线共同保证：

1. **系统提示词**要求模型只输出恰好三个键的 JSON：`summary`（字符串）、`sentiment`（`"Bullish" | "Neutral" | "Bearish"`）、`risk_level`（如 `"Low" | "Medium" | "High"`），禁止 markdown 代码块与额外文本。
2. **API 参数** `response_format={"type": "json_object"}` 作为第二层防御。
3. **返回后校验**：`json.loads()` 包在 try/except 中 → `AnalysisResult.model_validate()` 校验字段 → `sentiment` 由 `Literal` 类型收窄为三选一。

任一层失败都会**记录原始响应**（便于调试）并抛出 `AnalysisError`，由 `main.py` 转成 `502` 友好错误；**格式非法的分析绝不会被持久化**。`temperature=0.2` 用于保持输出格式稳定。

若改动提示词、schema 或温度，必须重新验证校验逻辑仍能拦截畸形输出。第四层防线在数据库侧：`sentiment` 列有 `CHECK` 约束（见 §5）。

### 3.5 存储模块（`db.py`）

同一组接口（`init_db` / `insert_analysis` / `list_history`）背后是两个适配器，按 `STORAGE_BACKEND` 分发：

- **SQLite**：文件表 `stock_analyses`，`id` 为应用生成的 UUID 字符串，`quote_data` 以 JSON 文本存储，`created_at` 为 ISO 时间串；建表脚本在 `SQLITE_SCHEMA` 内，启动时 `executescript` 幂等执行。
- **Supabase**：通过 `supabase-py` 惰性导入（只有真正使用时才 import）；启动时做一次**连通性检查**，让配置错误在部署阶段就失败，而不是等到第一个用户请求。`quote_data` 是原生 `jsonb`，`id` 与 `created_at` 由数据库生成。

两条路径的索引都是 `(symbol, created_at DESC)`，同时服务"按代码过滤"和"全局最新"两种查询。

---

## 4. 前端

前端是**纯 JavaScript (JSX)**，没有 TypeScript、没有路由库、没有状态管理库、也没有数据请求库——状态全部由 `App.jsx` 手写管理。

### 4.1 模块职责

| 文件 | 职责 |
|---|---|
| `main.jsx` | 挂载根组件；挂载前探测初始主题（`localStorage` → `prefers-color-scheme`）并给 `<body>` 打上 `dark` 类；用 `I18nProvider` 包裹 `App` |
| `App.jsx` | **唯一的顶层状态容器**：quote / analysis / history / loading / notice / theme，以及三个业务回调 |
| `api.js` | 后端客户端。导出 `api.health/quote/analyze/history` 与 `ApiError`（带 `status`，网络失败记为 `0`） |
| `i18n.jsx` | 中英词典 `dict`、`I18nProvider`、`useI18n()`；初始语言由 `localStorage` → `navigator.language` 决定 |
| `index.css` | Tailwind 三指令 + 自定义组件类（`.card` `.btn-primary` `.num` `.rule` `.marker` `.label-eyebrow` `.display-italic`）+ 纸张噪点层 + 动画 |
| `tailwind.config.js` | 设计令牌：`paper`/`ink`/`oxblood`/`forest`/`gold` 色板、三套字体、`darkMode: 'class'` |

### 4.2 组件

| 组件 | 职责 | 输入 |
|---|---|---|
| `Masthead` | 报头、长日期（每分钟刷新）、后端健康指示灯、明暗主题切换按钮 | `theme` `onToggleTheme` `healthy` |
| `SearchBar` | 输入框（自动转大写、限长 8）、实时正则校验与错误提示、快捷建议标签、`/` 聚焦快捷键、粘性吸顶 | `onSubmit` `loading` |
| `QuoteCard` | 巨大等宽价格、涨跌方向色、日高/日低/昨收/成交量四格、来源徽章、**"Analyze with AI" 按钮** | `quote` `onAnalyze` `analyzing` |
| `AnalysisCard` | 摘要引言、情绪徽章（色/符/字随情绪切换）、情绪/风险/生成时间三格、免责声明 | `analysis` `symbol` |
| `HistoryPanel` | 右侧粘性历史列表，每项显示代码、时间、摘要两行、情绪徽章、风险与价格 | `items` `onSelect` `activeId` |

### 4.3 工具与格式化

- `utils/validate.js`：`SYMBOL_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/`，与后端 `SYMBOL_PATTERN` 保持一致，构成第一道（非安全性的）体验校验。
- `utils/format.js`：`Intl.NumberFormat` 价格/百分比/成交量格式化、`formatDateTime` / `formatTime`（后者固定 UTC）、`directionOf` 与 `toneOf` 把涨跌方向和情绪映射为 Tailwind 色类。

### 4.4 三门语言 / 主题的持久化

- 主题键：`stocksight-theme`（`App.jsx` 写入，`main.jsx` 读取）；类挂在 `document.body` 上。
- 语言键：`stocksight-lang`（`i18n.jsx` 读写）；同时同步 `<html lang>`。

> ⚠️ **已知缺口**：`i18n.jsx` 定义了完整的 `dict` 与 `I18nProvider`，`main.jsx` 也挂载了它，但**目前没有任何组件调用 `useI18n()`**——界面文案仍是硬编码英文（`Masthead.jsx` 的 "Read the tape. Hear the AI." 等）。语言切换按钮也尚未接入 UI。详见 [FRONTEND.md](FRONTEND.md) 的缺口清单。

---

## 5. 数据契约与数据库

### 5.1 一次请求的形状

`QuoteData` 是前后端的共同语言——`/api/quote` 返回它，前端展示它，再把它原样放进 `/api/analyze` 的 `quote_data` 里：

```
symbol, price, change, change_percent, high, low,
volume, previous_close, market_state, fetched_at, provider
```

`AnalysisResult` 是 LLM 的返回值，也是 `AnalysisCard` 的输入：

```
summary (1..500 字), sentiment ("Bullish"|"Neutral"|"Bearish"), risk_level (1..50 字)
```

### 5.2 表 `stock_analyses`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `symbol` | text | 股票代码 |
| `quote_data` | jsonb / text | 原始行情载荷 |
| `ai_summary` | text | 来自 LLM 的 `summary` |
| `sentiment` | text | `CHECK` 约束：只允许三选一 |
| `risk_level` | text | 风险等级 |
| `created_at` | timestamptz | 默认 `now()` |

**`sentiment` 上的 `CHECK` 约束是有意为之的第三道防线**（前两道是提示词与代码校验），不要移除。

`supabase/migrations/0001_init.sql` 还额外启用了 **RLS 且不添加任何公开策略**——这样 anon / authenticated 客户端完全无法读写，而后端用 `service_role` 密钥可绕过 RLS 自由写入。因此 `SUPABASE_SERVICE_KEY` 必须是 service_role 密钥（不是 publishable/anon 密钥），且**只能存在于服务端**。

### 5.3 端到端数据流

```
浏览器 (React/Vite)
   │
   │ ① GET /api/quote?symbol=AAPL
   ▼
FastAPI ──► quote.py ──► yfinance
                   └──► 确定性 mock 回退
   │  （返回报价，前端展示）
   │
   │ ② POST /api/analyze { symbol, quote_data }
   ▼
FastAPI ──► analyze.py ──► OpenAI 兼容 Chat API
                      └──► json.loads + Pydantic 校验
   │
   ▼
db.py ──► SQLite（本地）/ Supabase（生产）
   ▲
   │ ③ GET /api/history
   │
前端刷新历史面板，并可点击历史项回看报价 + 分析
```

注意 ①②之间是**两次独立调用**：`/api/quote` 只读不写；只有用户显式点击 Analyze 触发 ②，才会产生一条持久化记录。

---

## 6. 配置、部署与已知边界

### 6.1 环境变量

后端（`backend/.env`，模板见 `.env.example`）：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` / `CORS_ORIGINS` / `STORAGE_BACKEND` / `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `QUOTE_CACHE_TTL` / `STOCK_DATA_PROVIDER`。

前端（`frontend/.env.local`）：只有 `VITE_API_BASE`。**Vite 会把 `VITE_*` 内联进产物，所以任何密钥都绝不能放在这里。**

完整表格见 [CONFIGURATION.md](CONFIGURATION.md)。

### 6.2 本地启动

```bash
# 终端 1 — 后端
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # 填入 OPENAI_API_KEY
.venv/bin/uvicorn main:app --reload --port 8000

# 终端 2 — 前端
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:5173`。想要离线行情演示可设 `STOCK_DATA_PROVIDER=mock`（AI 分析仍需可达的模型端点与密钥）。

### 6.3 部署

`render.yaml` 定义两个服务：`stocksight-backend`（Python Web，健康检查 `/api/health`）与 `stocksight-frontend`（静态站点，发布 `dist/`）。

几个刻意的选择：

- 生产默认 `STORAGE_BACKEND=supabase`，因为 Render 免费实例的**文件系统是临时的**，SQLite 文件会随重启/重部署丢失。
- 静态站点为 `/assets/*` 设置长缓存（文件名带内容哈希），为 `/index.html` 设 `no-cache`（否则浏览器学不到新的资源哈希）。
- 前端静态层也补了与后端一致的安全响应头，使 SPA 外壳在 JS 加载前就已加固。
- 关闭了 PR 预览环境，避免预览实例与生产争抢同一份 Supabase 行、并消耗同一份免费额度。

详见 [DEPLOYMENT.md](DEPLOYMENT.md)。

### 6.4 已知边界（MVP 有意不做）

当前无认证、历史非用户隔离、无限流、无请求体大小限制、无服务端行情二次校验、**无自动化测试、无 lint、无 CI**。行情缓存是**进程内**的，多实例间不共享；`/api/analyze` 接受客户端传来的 `quote_data`（仅做形状校验）。这些是已知限制，不是数据完整性或隐私保证。

公开多用户部署前请先读 [SECURITY.md](SECURITY.md)。

---

## 7. 想改某处时，该看哪个文件

| 需求 | 入口文件 |
|---|---|
| 加/改接口 | `backend/main.py`（路由）+ `backend/schemas.py`（模型） |
| 换 LLM 提供商或模型 | `backend/config.py`（`OPENAI_BASE_URL`/`OPENAI_MODEL`）或 `render.yaml` |
| 改提示词 / 输出字段 | `backend/analyze.py`（同步改 `docs/PROMPT.md` 与 `schemas.py`） |
| 换行情源 | `backend/quote.py` |
| 换存储后端 | `backend/db.py`（+ `supabase/migrations/`） |
| 改配色 / 字体 / 动画 | `frontend/tailwind.config.js` |
| 改自定义组件类（卡片、按钮、分隔线） | `frontend/src/index.css` |
| 改页面结构或业务状态 | `frontend/src/App.jsx` |
| 改某个区块的呈现 | 对应的 `frontend/src/components/*.jsx` |
| 接后端新接口 | `frontend/src/api.js` |
| 启用中英文切换 | `frontend/src/i18n.jsx` + 各组件接入 `useI18n()` |
