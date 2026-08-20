# Prompt Contract

The source of truth is [`backend/analyze.py`](../backend/analyze.py). The prompt is field-based: only validated quote fields are interpolated into the user message.

## System Message

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

## User Template

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

The API call uses `temperature=0.2` and `response_format={"type":"json_object"}`.

## Validation Path

1. The model response is read from the first completion choice.
2. `json.loads()` rejects non-JSON output.
3. `AnalysisResult.model_validate()` enforces `summary`, `sentiment`, and `risk_level` bounds.
4. Only a valid result is written to SQLite or Supabase.

Current caveats: unknown extra model keys are ignored by the Pydantic model, and `risk_level` is free text up to 50 characters. Tighten those constraints before treating the contract as strict.

The prompt must not imply facts that are absent from the input. For example, the current input does not include moving averages, news, fundamentals, or sector context; the model should not claim them as observed facts.
