# StockSight AI

StockSight AI 是一个美股行情与 AI 解读看板：输入股票代码，查看最新可用行情，再生成结构化的情绪和风险摘要。

> 这是 MVP 信息工具，不是交易系统或投资建议。行情可能延迟，AI 输出也可能不准确。

## 快速开始

环境要求：Python 3.12、Node.js 20、npm 10+，以及用于 AI 分析的兼容 OpenAI API。

```bash
# 后端
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# 在 backend/.env 中设置 OPENAI_API_KEY
.venv/bin/uvicorn main:app --reload --port 8000

# 另一个终端启动前端
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

打开 Vite 输出的地址，通常是 `http://localhost:5173`。离线演示行情可设置 `STOCK_DATA_PROVIDER=mock`；AI 分析仍需要可访问的模型端点和密钥。

## 文档

- [文档索引](docs/README.md)
- [API 参考](docs/API.md)
- [配置说明](docs/CONFIGURATION.md)
- [架构说明](docs/ARCHITECTURE.md)
- [Prompt 约定](docs/PROMPT.md)
- [Render/Supabase 部署](docs/DEPLOYMENT.md)
- [安全性与限制](docs/SECURITY.md)
- [故障排查](docs/TROUBLESHOOTING.md)
