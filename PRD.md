# StockSight AI — 产品需求文档（PRD）

## 1. 项目概述

**StockSight AI** 是一个 AI 驱动的实时股票行情分析看板。用户输入美股代码即可查看实时行情，并通过一键触发 LLM 分析，获取 JSON 格式的市场情绪、总结与风险评估。所有数据持久化至 Supabase，应用托管在 Render.com。

- **目标用户**：希望快速获取行情与 AI 解读的散户投资者
- **核心价值**：把"查行情 → 看解读"压缩到两次点击
- **交付形态**：单页 Web 应用 + 后端 API + Supabase 存储

## 2. 用户故事

| # | 角色 | 我想要 | 以便 |
|---|------|-------|------|
| US-1 | 投资者 | 输入股票代码（如 AAPL）查看实时价格、涨跌幅、成交量等 | 快速了解当前行情 |
| US-2 | 投资者 | 点击「AI 分析」按钮，让 LLM 对当前行情给出总结、情绪、风险等级 | 获得结构化的解读，而不是自己读图 |
| US-3 | 投资者 | 分析结果以清晰卡片展示，并自动保存到数据库 | 之后可以回溯历史分析记录 |

## 3. 功能模块

| 模块 | 功能 | 输入 | 输出 |
|------|------|------|------|
| **数据获取** | 调用免费 API 获取实时行情 | 股票代码 | 最新价、涨跌额、涨跌幅、成交量等 |
| **AI 分析** | 调用 LLM 分析行情，强制 JSON 输出 | 格式化后的行情数据 | JSON：`summary`、`sentiment`、`risk_level` |
| **数据存储** | 将原始行情 + 分析结果存入 Supabase | symbol、行情 JSON、分析 JSON | 数据库记录 |
| **展示交互** | 前端展示行情、分析结果，提供操作按钮 | 用户点击 | UI 更新 |

## 4. 数据流

```
用户输入 symbol
   │
   ▼
[前端] 点击「获取行情」
   │
   ▼
[后端] GET /api/quote?symbol=AAPL  ───►  免费股票 API
   │                                         │
   │◄────────────── 行情 JSON ───────────────┘
   ▼
[前端] 展示行情卡片
   │
   ▼
[前端] 点击「AI 分析」
   │
   ▼
[后端] POST /api/analyze  { symbol, quote_data }
   │
   ├─► 拼装 Prompt → LLM（强制 JSON 模式）
   │       │
   │       ▼
   │   解析 + 校验 JSON
   │       │
   │       ▼
   ├─► Supabase: INSERT stock_analyses
   │
   ▼
[前端] 渲染分析卡片
```

**关键约束**：持久化只发生在 `/api/analyze`，未分析的行情不入库。

## 5. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React (Vite) + Tailwind | 快速构建、易部署 |
| 后端 | Python FastAPI 或 Node.js Express | 调用股票 API + LLM，写入 Supabase |
| LLM | OpenAI `gpt-4o-mini` | 成本低，配合 `response_format={"type":"json_object"}` |
| 行情源 | Alpha Vantage / Twelve Data / yfinance | 免费额度优先，受限时切换 |
| 数据库 | Supabase (PostgreSQL) | 免费额度足够 MVP |
| 部署 | Render.com | GitHub 自动部署 |

## 6. 非功能需求

- **JSON 强约束**：必须通过 Prompt + API 参数双重保障，保证 LLM 只输出合法 JSON。
- **机密管理**：所有 API Key（OpenAI、行情源、Supabase service key）只放在后端环境变量，绝不进入前端打包产物。
- **CORS**：后端需正确配置允许前端域名的跨域访问。
- **可观测性**：LLM 解析失败时，记录原始响应用于排查。

## 7. 数据库设计

**表名**：`stock_analyses`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `uuid` | 主键，默认 `gen_random_uuid()` |
| `symbol` | `text` | 股票代码 |
| `quote_data` | `jsonb` | 原始行情 |
| `ai_summary` | `text` | LLM 返回的 `summary` |
| `sentiment` | `text` | CHECK 约束：`'Bullish' \| 'Neutral' \| 'Bearish'` |
| `risk_level` | `text` | 例如 `'Low' \| 'Medium' \| 'High'` |
| `created_at` | `timestamp` | 默认 `now()` |

> `sentiment` 的 DB-level CHECK 与后端校验、Prompt 约束构成"三道防线"，缺一不可。

## 8. Prompt 工程

### 8.1 System Prompt

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

### 8.2 User Message 模板

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

### 8.3 API 调用参数（OpenAI 示例）

```python
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ],
    temperature=0.2,                              # 降低随机性
    response_format={"type": "json_object"},      # 强制 JSON 模式
)
```

### 8.4 后端解析 + 容错

```python
try:
    ai_json = json.loads(response.choices[0].message.content)
    required_keys = {"summary", "sentiment", "risk_level"}
    if not required_keys.issubset(ai_json.keys()):
        raise ValueError("Missing required fields")
    if ai_json["sentiment"] not in {"Bullish", "Neutral", "Bearish"}:
        raise ValueError("Invalid sentiment value")
except (json.JSONDecodeError, ValueError) as e:
    print(f"LLM response parsing error: {e}\nRaw: {response.choices[0].message.content}")
    return {"error": "AI analysis failed. Please try again."}
```

**重要**：校验失败时不得写库，只返回友好错误。

## 9. API 设计

### `GET /api/quote`

| 项 | 说明 |
|----|------|
| Query | `symbol`（必填，美股代码） |
| 成功响应 | `200` + 行情 JSON |
| 失败响应 | `400` 参数错误 / `502` 上游 API 异常 |

### `POST /api/analyze`

| 项 | 说明 |
|----|------|
| Body | `{ "symbol": "AAPL", "quote_data": { ... } }` |
| 成功响应 | `200` + `{ "summary", "sentiment", "risk_level" }` |
| 失败响应 | `400` 参数错误 / `502` LLM 返回非法 JSON |
| 副作用 | 成功时写入 `stock_analyses` 一行 |

## 10. 安全与风险

### 10.1 密钥与机密
- 所有第三方密钥（OpenAI、行情源、Supabase service key）仅存于后端环境变量；本地用 `.env`（必须 git-ignore），生产用 Render 环境变量。
- Supabase **service key 严禁出现在前端 bundle 或客户端代码**；前端如需直连 Supabase，只能使用 anon key 并配合 RLS。
- 提交前用 `git-secrets` 或同类工具扫描，防止误提交。

### 10.2 输入校验
- `symbol` 必须正则校验（如 `^[A-Z]{1,5}$`），拒绝任何非预期字符；防止经由 symbol 触发上游 API 的异常路径或 Prompt 注入。
- `/api/analyze` 收到的 `quote_data` 必须按白名单字段提取，不要把任意前端 JSON 原样拼入 Prompt。
- 所有请求体设置大小上限，避免巨型 payload 拖垮后端或喂给 LLM。

### 10.3 Prompt 注入与 LLM 输出风险
- 拼装 User Message 时使用 **字段级模板** 而非整段 JSON 拼接；行情字段值需做长度上限与字符过滤，避免攻击者在 quote_data 中塞入 `"Ignore previous instructions"` 之类指令。
- LLM 响应已有三道防线（System Prompt 约束 + `response_format` + 后端校验 + DB CHECK），任何一道告警都不得入库。
- LLM 可能**幻觉**：必须在前端展示「AI 分析仅供参考、非投资建议」的免责声明（见 10.7）。

### 10.4 限流与成本控制
- 后端按 IP 对 `/api/analyze` 限流（如每分钟 ≤ N 次），防止恶意请求把 LLM 账单打爆。
- 在 OpenAI 后台设置 **月度硬上限（hard limit）**，超出自动停服而非继续计费。
- 行情 API 也按免费额度做短时缓存（同一 symbol 在 N 秒内复用结果），降低被限流风险。

### 10.5 网络与传输
- 全站强制 HTTPS（Render 默认）；自定义域名需正确配置 TLS。
- CORS 严格白名单：只允许部署的前端域名，禁用 `*`。
- 建议响应头加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。

### 10.6 数据库
- 启用 Supabase **Row Level Security**；`stock_analyses` 默认拒绝公开读写，所有读写经后端 service key。
- 当前 PRD 无登录场景，DB 中不存储用户身份或个人信息；如后续接入用户系统，需重新评估字段与 RLS 策略。

### 10.7 业务合规与免责
- 前端首屏 + 分析卡片必须包含明确文案：「本应用提供的行情与 AI 分析仅供参考，不构成任何投资建议；据此操作风险自负」。
- UI 文案不得使用「推荐买入」「建议卖出」等明确建议性话术，避免被解读为荐股。
- 行情可能存在延迟（免费 API 通常非实时 tick），UI 上标注最近更新时间与数据源。

### 10.8 错误处理与日志
- 对外错误信息脱敏：返回前端的错误只含通用描述（如 `"AI analysis failed, please try again"`），不暴露堆栈、上游 URL、Key 片段。
- 日志中**禁止打印**完整 API Key、`Authorization` 头、用户 PII。
- LLM 解析失败时记录原始 response 仅用于调试，生产日志需设定保留期限并定期清理。

### 10.9 依赖与供应链
- 锁定依赖版本（`package-lock.json` / `requirements.txt` 固定到具体版本）。
- 定期跑依赖漏洞扫描（`npm audit` / `pip-audit`），CI 中失败应阻断发布。

### 10.10 风险登记表

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpenAI 账单失控 | 财务损失 | 月度硬上限 + 接口限流 + 缓存 |
| 行情 API 触发限流 | 功能不可用 | 短时缓存 + 多源切换（Alpha Vantage / Twelve Data / yfinance） |
| LLM 输出非法 JSON | analyze 失败 | 三道防线（Prompt + response_format + 后端校验 + DB CHECK） |
| LLM 幻觉给出错误判断 | 用户误信、潜在合规风险 | 免责声明 + 文案约束 + 不展示建议性结论 |
| Service key 泄露 | 数据被改/删 | 仅后端使用 + RLS + 提交前扫描 |
| Prompt 注入 | 绕过指令、伪造输出 | 字段白名单 + 长度过滤 + 输出校验 |
| 上游服务故障（OpenAI / Render） | 功能中断 | 友好降级页面，区分上游故障与系统故障 |
| 依赖漏洞 | 后端被攻陷 | 锁版本 + 定期审计 |

## 11. 交付物（README 必含）

1. **在线访问 URL**：部署后 Render 生成的地址。
2. **Prompt 截图或代码**：System Prompt + User Message 模板。
3. **Debug 记录示例**：构建/部署中至少一处真实问题及其修复过程（例如 CORS、Render 环境变量、LLM JSON 解析失败等），附日志或代码 diff。

## 12. 里程碑（建议）

| 阶段 | 内容 |
|------|------|
| M1 | 后端骨架 + `/api/quote` 跑通免费行情 API |
| M2 | `/api/analyze` 接入 LLM，本地通过 JSON 校验 |
| M3 | 接入 Supabase，验证写库与 CHECK 约束 |
| M4 | 前端 UI 接两个接口，本地端到端可用 |
| M5 | Render 部署 + 写 README 三项交付物 |
