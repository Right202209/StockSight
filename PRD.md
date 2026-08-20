# StockSight AI — 产品需求文档（PRD）

## 0. 当前实现基线（2026-08）

本文档同时记录产品目标与当前 MVP 的交付边界。除非标注为“计划”，下表是仓库中已经实现并可按 README 运行的行为。

| 范围 | 状态 | 当前基线 |
|---|---|---|
| 前端 | ✅ 已实现 | React 18 + Vite 5 + Tailwind CSS 3，响应式单页界面 |
| 后端 | ✅ 已实现 | Python 3.12 + FastAPI，`/api/health`、`/api/quote`、`/api/analyze`、`/api/history` |
| 行情 | ✅ 已实现 | `yfinance` + 30 秒进程内缓存；上游失败时使用确定性 mock，并返回来源标记 |
| AI 分析 | ✅ 已实现 | OpenAI-compatible Chat Completions，JSON mode，`json.loads` + Pydantic 校验 |
| 存储 | ✅ 已实现 | 本地 SQLite；生产通过 `STORAGE_BACKEND=supabase` 使用 Supabase |
| 部署 | ✅ 已实现 | `render.yaml` 提供 FastAPI Web Service + Vite 静态站点 Blueprint |
| 认证、用户隔离、限流、请求体大小限制 | 🗺 计划 | 当前 MVP 未实现，公开部署前必须补齐或明确接受风险 |
| 自动化测试、Lint、CI、依赖漏洞扫描 | 🗺 计划 | 当前仓库没有对应脚本或流水线 |
| 在线访问地址 | ⚠️ 待验证 | Blueprint 中的 `*.onrender.com` 是默认主机名，不代表已经在线 |

产品目标中的“实时行情”在实现中应理解为“上游返回的最新可用行情”；免费数据源可能延迟，且可能被替换为 Demo Data。

## 1. 项目概述

**StockSight AI** 是一个 AI 驱动的美股行情分析看板。用户输入股票代码即可查看最新可用行情，并通过一键触发 LLM 分析，获取结构化的市场情绪、总结与风险评估。分析记录本地默认持久化到 SQLite，生产环境可切换到 Supabase；应用可通过 Render Blueprint 部署。

- **目标用户**：希望快速获取行情与 AI 解读的散户投资者
- **核心价值**：把"查行情 → 看解读"压缩到两次点击
- **交付形态**：单页 Web 应用 + 后端 API + SQLite/Supabase 存储适配器

## 2. 用户故事

| # | 角色 | 我想要 | 以便 |
|---|------|-------|------|
| US-1 | 投资者 | 输入股票代码（如 AAPL）查看实时价格、涨跌幅、成交量等 | 快速了解当前行情 |
| US-2 | 投资者 | 点击「AI 分析」按钮，让 LLM 对当前行情给出总结、情绪、风险等级 | 获得结构化的解读，而不是自己读图 |
| US-3 | 投资者 | 分析结果以清晰卡片展示，并自动保存到数据库 | 之后可以回溯历史分析记录 |

## 3. 功能模块

| 模块 | 功能 | 输入 | 输出 |
|------|------|------|------|
| **数据获取** | 调用 `yfinance` 获取最新可用行情，失败时降级到确定性 mock | 股票代码 | 最新价、涨跌额、涨跌幅、成交量、来源等 |
| **AI 分析** | 调用 LLM 分析行情，强制 JSON 输出 | 格式化后的行情数据 | JSON：`summary`、`sentiment`、`risk_level` |
| **数据存储** | 将原始行情 + 分析结果写入 SQLite 或 Supabase | symbol、行情 JSON、分析 JSON | 数据库记录 |
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
   ├─► STORAGE_BACKEND=sqlite: INSERT stock_analyses
   └─► STORAGE_BACKEND=supabase: INSERT stock_analyses
   │
   ▼
[前端] 渲染分析卡片
```

**关键约束**：持久化只发生在 `/api/analyze`，未分析的行情不入库。

## 5. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React (Vite) + Tailwind | 快速构建、易部署 |
| 后端 | Python FastAPI | 服务端调用行情 API + LLM，并写入存储适配器 |
| LLM | OpenAI-compatible Chat Completions（默认 `gpt-4o-mini`） | 配合 `response_format={"type":"json_object"}` |
| 行情源 | `yfinance` + deterministic mock fallback | 30 秒进程内缓存，UI 展示来源 |
| 数据库 | SQLite（本地）/ Supabase (PostgreSQL)（生产） | 由 `STORAGE_BACKEND` 切换 |
| 部署 | Render Blueprint | FastAPI Web Service + Vite 静态站点 |

## 6. 非功能需求

- **JSON 强约束**：通过 Prompt + API 参数 + `json.loads` + Pydantic 校验保障；当前模型会忽略未知额外 key，严格拒绝额外 key 为后续加固项。
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

> `sentiment` 的 DB-level CHECK 与后端校验、Prompt/API 约束构成多道防线，缺一不可。

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
import json
from pydantic import ValidationError
from schemas import AnalysisResult

try:
    raw = response.choices[0].message.content or ""
    ai_json = json.loads(raw)
    result = AnalysisResult.model_validate(ai_json)
except (json.JSONDecodeError, ValidationError) as e:
    print(f"LLM response parsing error: {e}\nRaw: {raw}")
    return {"error": "AI analysis failed. Please try again."}
```

**重要**：校验失败时不得写库，只返回友好错误。当前实现使用 `AnalysisResult.model_validate()` 完成这一步；未知额外 key 会被 Pydantic 默认忽略，若产品要求严格的三 key 集合，应将模型配置为拒绝额外字段。

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
- `symbol` 必须正则校验（`^[A-Z]{1,5}(\.[A-Z]{1,2})?$`），拒绝任何非预期字符；防止经由 symbol 触发上游 API 的异常路径或 Prompt 注入。
- `/api/analyze` 当前按 Pydantic 模型提取字段，不把任意 JSON 原样拼入 Prompt；字段长度/字符过滤与服务端重新获取行情为**计划中的加固项**。
- 请求体大小限制为**计划中的加固项**，当前版本尚未实现。

### 10.3 Prompt 注入与 LLM 输出风险
- 拼装 User Message 时使用 **字段级模板** 而非整段 JSON 拼接；行情字段值的严格长度/字符过滤仍是**计划中的加固项**。
- LLM 响应已有多道防线（System Prompt 约束 + `response_format` + 后端校验 + DB CHECK），任何一道告警都不得入库。
- LLM 可能**幻觉**：必须在前端展示「AI 分析仅供参考、非投资建议」的免责声明（见 10.7）。

### 10.4 限流与成本控制
- 后端按 IP/用户对 `/api/analyze` 限流（计划；当前 MVP 未实现），防止恶意请求把 LLM 账单打爆。
- 在 OpenAI/模型供应商后台设置 **月度硬上限（hard limit）**（运维必做；应用本身当前未实现费用闸门）。
- 行情 API 也按免费额度做短时缓存（同一 symbol 在 N 秒内复用结果），降低被限流风险。

### 10.5 网络与传输
- 全站强制 HTTPS（Render 默认）；自定义域名需正确配置 TLS。
- CORS 严格白名单：只允许部署的前端域名，禁用 `*`。
- 建议响应头加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。

### 10.6 数据库
- 启用 Supabase **Row Level Security**；`stock_analyses` 默认拒绝 Supabase 公开读写，后端通过 service key 访问。当前后端 `/api/history` 未认证且未按用户隔离，属于公开 MVP 数据。
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
- 锁定依赖版本（前端 `package-lock.json` + 精确版本，后端 `requirements.txt` 精确版本）。
- 定期跑依赖漏洞扫描（`npm audit` / `pip-audit`）并在 CI 中阻断发布（计划；当前尚无 CI）。

### 10.10 风险登记表

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpenAI 账单失控 | 财务损失 | 月度硬上限（运维）+ 接口限流（计划）+ 行情缓存 |
| 行情 API 触发限流 | 功能不可用 | 30 秒缓存 + deterministic mock fallback；多源切换为后续计划 |
| LLM 输出非法 JSON | analyze 失败 | 多道防线（Prompt + response_format + 后端校验 + DB CHECK） |
| LLM 幻觉给出错误判断 | 用户误信、潜在合规风险 | 免责声明 + 文案约束 + 不展示建议性结论 |
| Service key 泄露 | 数据被改/删 | 仅后端使用 + RLS + 提交前扫描 |
| Prompt 注入 | 绕过指令、伪造输出 | 字段级模板 + 输出校验；长度/字符过滤为后续计划 |
| 上游服务故障（OpenAI / Render） | 功能中断 | 友好降级页面，区分上游故障与系统故障 |
| 依赖漏洞 | 后端被攻陷 | 锁版本 + 定期审计 |

## 11. 交付物（README 必含）

1. **在线访问 URL**：部署后 Render 生成并验证的地址；当前仓库只提供 Blueprint 默认主机名。
2. **Prompt 截图或代码**：System Prompt + User Message 模板。
3. **Debug 记录示例**：构建/部署中至少一处真实问题及其修复过程（例如 CORS、Render 环境变量、LLM JSON 解析失败等），附日志或代码 diff。

## 12. 里程碑（建议）

| 阶段 | 内容 |
|------|------|
| M1 | ✅ 后端骨架 + `/api/quote` + mock fallback |
| M2 | ✅ `/api/analyze` 接入 OpenAI-compatible API，本地 JSON 校验 |
| M3 | ✅ Supabase 适配器、迁移、RLS 与 CHECK 约束 |
| M4 | ✅ 前端 UI 接入 quote/analyze/history，本地端到端可用 |
| M5 | ⚠️ Render Blueprint 与 README 已准备；在线部署验证待完成 |
