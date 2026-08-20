# StockSight AI

[English](README.md) | [简体中文](README.zh-CN.md)

> 面向最新可用美国股票报价的编辑式仪表盘，并提供简洁、结构化的 AI 解读。

| | 状态 |
|---|---|
| 本地开发 | 已实现端到端流程 |
| 生产演示 | 尚未提交经过验证的线上 URL；`render.yaml` 提供默认 Render 主机名 |
| 前端 | React 18 · Vite 5 · Tailwind CSS 3 |
| 后端 | FastAPI · Python 3.12 |
| 持久化 | 本地使用 SQLite · 生产环境使用 Supabase |
| AI | 兼容 OpenAI 的 Chat Completions API |

这是一个 MVP，而不是交易系统。报价数据可能存在延迟，Yahoo Finance 可能不可用，模型输出也可能有误。该界面仅供信息参考，不构成投资建议。

## 功能概览

输入诸如 `AAPL` 的股票代码，查看报价，然后点击 **AI Analyze** 生成简短的情绪和风险解读。成功的分析会显示在最近历史记录面板中，并被持久化保存。

```text
Browser (React/Vite)
   │
   ├── GET /api/quote?symbol=AAPL ──► FastAPI ──► yfinance
   │                                      │          └─► deterministic mock fallback
   │                                      └─► normalized QuoteData
   │
   ├── POST /api/analyze ───────────► FastAPI ──► OpenAI-compatible Chat API
   │                                      │          └─► JSON parse + Pydantic validation
   │                                      └─► persist only valid analyses
   │                                           ├─ SQLite (local)
   │                                           └─ Supabase (production)
   │
   └── GET /api/history ────────────► recent saved analyses
```

浏览器不会收到报价提供商密钥、模型密钥或 Supabase 服务密钥。持久化发生在 `/api/analyze`，而不是 `/api/quote`。

### 当前行为

- 股票代码会被规范化为大写，并根据 `^[A-Z]{1,5}(\.[A-Z]{1,2})?$` 进行检查。
- 优先使用 `yfinance`。提供商出错时会回退到按股票代码确定性的 mock 数据；API 返回 `provider: "mock"`，界面显示 **Demo Data** 标记。
- 报价默认在进程内存中缓存 30 秒（可通过 `QUOTE_CACHE_TTL` 配置）。
- 分析结果包含 `summary`（1–500 个字符）、`sentiment`（`Bullish`、`Neutral` 或 `Bearish`）以及 `risk_level`（非空、最多 50 个字符的字符串）。
- 界面包含报价来源/时间戳、健康状态指示器、浅色/深色模式、股票代码建议、`/` 键盘聚焦、响应式历史记录面板，以及“非投资建议”免责声明。

## 环境要求

请参阅 [REQUIREMENTS.md](REQUIREMENTS.md)，了解实现矩阵和计划中的加固工作。

你需要：

- Python 3.12（Render 固定使用 3.12.3）。
- Node.js 20 和 npm 10+（Render 固定使用 Node 20.18.0）。
- 一个兼容 OpenAI 的 API 密钥，以及支持 Chat Completions 和 `response_format={"type":"json_object"}` 的分析端点。
- 如果使用默认报价提供商，需要能够访问 Yahoo Finance 的网络连接。设置 `STOCK_DATA_PROVIDER=mock` 可使用确定性的离线报价数据。

后端依赖已在 [`backend/requirements.txt`](backend/requirements.txt) 中精确锁定。前端依赖由 [`frontend/package-lock.json`](frontend/package-lock.json) 解析；在 CI 或部署中请使用 `npm ci`，而不是 `npm install`。

## 本地开发

### 1. 启动后端

从 `backend/` 目录运行以下命令；设置会根据当前工作目录加载 `.env`。

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，设置 OPENAI_API_KEY（以及需要覆盖的报价源/存储配置）。
.venv/bin/uvicorn main:app --reload --port 8000
```

API 地址为 `http://localhost:8000`。FastAPI 还会在 `/docs` 提供交互式文档，并在 `/openapi.json` 提供架构。

如果不使用 Yahoo，可将 `STOCK_DATA_PROVIDER=mock` 写入 `backend/.env`，执行仅报价的冒烟测试。Mock 报价不会 mock LLM：**AI Analyze 仍需要可访问的兼容模型端点和密钥。**

### 2. 启动前端

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

打开 Vite 输出的 URL，通常是 `http://localhost:5173`。后端默认允许列表同时包含 `localhost` 和 `127.0.0.1`；如果使用其他来源，请在启动后端前将其加入 `CORS_ORIGINS`。

可用的前端脚本：

```bash
npm run dev       # 开发服务器
npm run build     # 生产构建输出到 dist/
npm run preview   # 预览生产构建
```

仓库目前还没有自动化测试或 lint 脚本。

### API 冒烟测试

```bash
curl http://localhost:8000/api/health
curl 'http://localhost:8000/api/quote?symbol=AAPL'
curl 'http://localhost:8000/api/history?limit=20'
```

调用 `/api/analyze` 前，请先将报价响应作为 `quote_data`：

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "symbol": "AAPL",
    "quote_data": {
      "symbol": "AAPL",
      "price": 190.50,
      "change": 1.20,
      "change_percent": 0.63,
      "high": 191.00,
      "low": 188.00,
      "volume": 50000000,
      "previous_close": 189.30,
      "market_state": "REGULAR",
      "fetched_at": "<ISO-8601 timestamp>",
      "provider": "mock"
    }
  }'
```

## 配置

### 后端：`backend/.env`

| 变量 | 默认值 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | 代码中为 `sk-missing` | 分析必需；仅保存在服务器端 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 兼容 OpenAI 的 API 基础 URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | 该端点支持的模型名称 |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 以逗号分隔的、完全匹配的前端来源 |
| `STORAGE_BACKEND` | `sqlite` | 本地使用 `sqlite`，生产环境使用 `supabase` |
| `DATABASE_URL` | `sqlite:///./stocksight.db` | 仅由 SQLite 存储使用 |
| `SUPABASE_URL` | 空 | 使用 Supabase 存储时必需 |
| `SUPABASE_SERVICE_KEY` | 空 | Supabase `service_role` 密钥；此处绝不能使用或暴露 anon 密钥 |
| `QUOTE_CACHE_TTL` | `30` | 报价缓存的生命周期（秒） |
| `STOCK_DATA_PROVIDER` | `yfinance` | 使用 mock 回退的 `yfinance`，或设为 `mock` 强制使用演示数据 |

### 前端：`frontend/.env.local`

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8000` | 后端来源；必须包含协议 |

Vite 会在构建时嵌入 `VITE_*` 值。绝不要把后端密钥放入前端环境变量或源文件。

## API 参考

### `GET /api/health`

返回浅层的进程健康状态：

```json
{"status":"ok"}
```

### `GET /api/quote?symbol=AAPL`

接受符合上述股票代码格式的代码。成功响应为 `QuoteData` 对象：

```json
{
  "symbol": "AAPL",
  "price": 190.5,
  "change": 1.2,
  "change_percent": 0.63,
  "high": 191.0,
  "low": 188.0,
  "volume": 50000000,
  "previous_close": 189.3,
  "market_state": "REGULAR",
  "fetched_at": "<ISO-8601 timestamp>",
  "provider": "yfinance"
}
```

无效代码返回 `400`；无法恢复的报价错误返回 `502`。在常见的上游失败情况下，回退机制会使端点仍返回报价，并将 `provider` 设为 `"mock"`。

### `POST /api/analyze`

请求体：

```json
{
  "symbol": "AAPL",
  "quote_data": { "...": "QuoteData fields" }
}
```

代码必须与 `quote_data.symbol`（不区分大小写）匹配。成功响应为：

```json
{
  "id": "<uuid>",
  "summary": "AAPL is up modestly on the session.",
  "sentiment": "Bullish",
  "risk_level": "Medium"
}
```

`400` 表示输入无效或代码不匹配；`422` 表示 FastAPI 请求校验失败；`502` 表示模型/上游错误或模型响应格式错误。失败的分析不会被持久化。

### `GET /api/history`

使用 `symbol` 进行筛选，使用 `limit` 请求 1–100 条记录（界面请求 20 条）：

```text
/api/history?symbol=AAPL&limit=20
```

响应结构：

```json
{
  "items": [
    {
      "id": "<uuid>",
      "symbol": "AAPL",
      "quote_data": { "...": "QuoteData" },
      "ai_summary": "AAPL is up modestly on the session.",
      "sentiment": "Bullish",
      "risk_level": "Medium",
      "created_at": "<ISO-8601 timestamp>"
    }
  ]
}
```

## Prompt 约定

事实来源是 [`backend/analyze.py`](backend/analyze.py)。Prompt 有意按字段组织：只有下面经过校验的报价字段会插入用户消息。

### 系统消息

```text
You are a professional financial analyst AI.
Your task is to analyze the given real-time stock quote data and output a strict JSON object.
Your response must contain ONLY a valid JSON object (no markdown code fences, no extra text).
The JSON must have exactly these three fields:
- "summary": A concise one-sentence summary of the stock's current performance (string).
- "sentiment": One of "Bullish", "Neutral", or "Bearish" (string).
- "risk_level": A risk assessment, e.g., "Low", "Medium", or "High" (string).

Do not include any additional keys. Do not wrap the JSON in code blocks. Do not provide explanations.
Example of valid output:
{"summary": "AAPL is up 2.3% on strong volume, breaking above 20-day moving average.", "sentiment": "Bullish", "risk_level": "Medium"}
```

### 用户消息模板

```text
Analyze the following stock data and produce the required JSON:

Symbol: {symbol}
Current Price: {price}
Change: {change} ({change_percent}%)
Day High: {high}
Day Low: {low}
Volume: {volume}
Previous Close: {previous_close}
Market State: {market_state}
```

调用使用 `temperature=0.2` 和 `response_format={"type":"json_object"}`。随后后端执行 `json.loads()` 和 `AnalysisResult.model_validate()`；只有通过验证的结果才会到达数据库的 sentiment 检查。这里有一个需要注意的细节：当前 Pydantic 模型会忽略未知的额外键，并且 `risk_level` 在长度限制内允许任意文本。如果必须要求精确的键集合或固定的风险枚举，应收紧模型并增加测试。

## Supabase 持久化

SQLite 是本地工作的默认选项。Render 的免费文件系统是临时的，因此生产环境应使用 Supabase。

1. 创建一个 Supabase 项目。
2. 在 Supabase SQL 编辑器中运行 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)。该脚本会创建 `stock_analyses`、索引和 `sentiment` 检查约束，并启用 RLS（不创建公开策略）。
3. 设置 `STORAGE_BACKEND=supabase`、`SUPABASE_URL` 和仅供后端使用的 `SUPABASE_SERVICE_KEY`。
4. 启动后端。启动过程会执行零行连接检查；如果表、URL 或密钥不正确，会快速失败。

尽管直接的 Supabase 匿名访问因 RLS 被阻止，后端历史记录路由目前仍未进行身份验证；请将存储的分析视为公开的 MVP 数据。

## 部署到 Render

仓库包含 [`render.yaml`](render.yaml)，其中定义了：

- `stocksight-backend`：根目录为 `backend` 的 Python Web 服务，并以 `/api/health` 作为健康检查。
- `stocksight-frontend`：根目录为 `frontend` 的 Vite 静态构建，从 `dist` 发布，并配置 SPA 回退。

使用 Blueprint 的步骤：

1. 将仓库推送到 GitHub，并在 Render 中创建 **New → Blueprint**。
2. 按提示提供 `OPENAI_API_KEY`、`SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 的值。
3. 在后端启动前应用 Supabase migration。
4. 如果重命名任一 Render 服务，请将 `CORS_ORIGINS` 和 `VITE_API_BASE` 更新为实际生成的来源。

Blueprint 中的默认主机名（`stocksight-frontend.onrender.com` 和 `stocksight-backend.onrender.com`）只是预测值，并非经过验证的线上演示 URL。Render 免费层在空闲时会休眠，因此冷启动后的第一次请求可能需要约 30 秒。

## 调试日志：Yahoo 限流

在早期部署期间，Yahoo Finance 对来自托管出口网段的每一个 `yfinance` 请求都返回 `429 Too Many Requests`：

```text
$AAPL: possibly delisted; no price data found (period=5d)
429 Client Error: Too Many Requests: query2.finance.yahoo.com/...
```

原先的行为会向用户返回 `502`。修复方式是捕获 `QuoteError`，返回确定性的 mock 数据，并公开其来源：

```python
try:
    quote = _fetch_yfinance(symbol)
except QuoteError as exc:
    log.warning("yfinance failed for %s, falling back to mock: %s", symbol, exc)
    quote = _fetch_mock(symbol)
```

现在界面显示 **Demo Data**，不会把回退值伪装成实时 Yahoo 数据。这是优雅降级路径，并不表示 mock 值能代表市场。

## 安全性与限制

已实现的保护措施包括：后端专用密钥、精确的 CORS 来源、`nosniff`/`DENY`/`no-referrer` 响应头、股票代码规范化、Pydantic 请求校验、报价缓存、Supabase RLS、数据库 sentiment 检查，以及明确的免责声明。

以下功能尚未实现，应视为面向公开多用户服务发布前的要求：

- 身份验证和按用户隔离的历史记录；
- 按 IP/用户限流，以及外部模型费用上限；
- 请求体大小限制和更严格的报价字段过滤；
- 服务端重新获取报价或对报价载荷进行签名；
- 严格拒绝模型输出中的未知键，并使用固定的风险等级枚举；
- 自动化测试、lint、CI、依赖漏洞扫描和密钥扫描。

另请注意，`/api/analyze` 在进行结构校验后接受客户端提供的报价数据。因此，未认证的调用者可以提交伪造值或触发模型费用；这是有意保留的 MVP 限制，在扩大开放范围前应予以解决。

## 仓库结构

```text
StockSight/
├── REQUIREMENTS.md              # implementation matrix and hardening requirements
├── PRD.md                       # original product brief
├── README.md
├── README.zh-CN.md              # 简体中文文档
├── render.yaml                  # Render Blueprint for backend + frontend
├── backend/
│   ├── main.py                  # FastAPI app, routes, CORS, headers
│   ├── config.py                # environment-backed settings
│   ├── schemas.py               # request/response models and symbol validation
│   ├── quote.py                 # yfinance, cache, mock fallback
│   ├── analyze.py               # prompt, model call, response validation
│   ├── db.py                    # SQLite/Supabase storage dispatch
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/                     # React app, components, API wrapper, utilities
└── supabase/migrations/
    └── 0001_init.sql            # schema, index, CHECK, and RLS
```

## 贡献

不要将提供商和模型凭据提交到 git；行为发生变化时请更新 `REQUIREMENTS.md`，并在提交变更前运行前端生产构建：

```bash
cd frontend
npm ci
npm run build
```

仓库目前还没有许可证文件或自动化测试套件。
