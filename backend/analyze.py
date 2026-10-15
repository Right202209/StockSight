from __future__ import annotations

import json
import logging
import time
from functools import lru_cache
from json import JSONDecodeError

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from config import get_settings
from schemas import AnalysisResult, QuoteData

log = logging.getLogger(__name__)

# NOTE: `response_format={"type": "json_object"}` requires the word "JSON"
# somewhere in the messages. Do NOT remove it while "tidying" the prompt —
# the API rejects the request with an error if it's gone.
SYSTEM_PROMPT = """You are a professional financial analyst AI.
Your task is to analyze the given real-time stock quote data and output a strict JSON object.
Your response must contain ONLY a valid JSON object (no markdown code fences, no extra text).
The JSON must have exactly these three fields:
- "summary": A concise one-sentence summary of the stock's current performance (string), at most 60 words.
- "sentiment": One of "Bullish", "Neutral", or "Bearish" (string).
- "risk_level": One of "Low", "Medium", or "High" (string).

Do not include any additional keys. Do not wrap the JSON in code blocks. Do not provide explanations.
The user message also contains the string JSON — keep the word "JSON" in the conversation for the response format parameter.
Example of valid output:
{"summary": "AAPL is up 2.3% on strong volume, breaking above 20-day moving average.", "sentiment": "Bullish", "risk_level": "Medium"}"""

# Only the fields the model actually needs. Fewer input tokens = lower
# latency and cost.
USER_TEMPLATE = """Analyze the following stock data and produce the required JSON:

Symbol: {symbol}
Current Price: {price}
Change: {change} ({change_percent}%)
Day High: {high}
Day Low: {low}
Volume: {volume}
Previous Close: {previous_close}
Market State: {market_state}"""

# Bound the raw-output log line so a runaway reply can't flood the logs with
# the full model dump (and, more importantly, keeps secrets out of logs).
RAW_LOG_LIMIT = 2000


class AnalysisError(Exception):
    """Raised when the LLM fails or returns malformed output."""


def _build_user_message(symbol: str, quote: QuoteData) -> str:
    return USER_TEMPLATE.format(
        symbol=symbol,
        price=quote.price,
        change=quote.change,
        change_percent=quote.change_percent,
        high=quote.high,
        low=quote.low,
        volume=quote.volume,
        previous_close=quote.previous_close,
        market_state=quote.market_state,
    )


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    """Reuse one client (and one HTTP connection pool) instead of building a
    new OpenAI instance on every request. The SDK's default 10-minute timeout
    and two retries are also overridden here."""
    s = get_settings()
    return OpenAI(
        api_key=s.openai_api_key,
        base_url=s.openai_base_url,
        timeout=s.llm_timeout_seconds,
        max_retries=1,
    )


def _parse_json(raw: str, symbol: str) -> dict:
    try:
        parsed = json.loads(raw)
    except JSONDecodeError as e:
        # No fence-stripping on purpose: markdown fences mean the prompt /
        # response_format contract is drifting, and that must surface as a
        # 502 with no row written rather than be silently accepted.
        # Bounded log: enough to debug, not enough to bloat or leak.
        log.error("LLM returned non-JSON for %s: %.2000s", symbol, raw[:RAW_LOG_LIMIT])
        raise AnalysisError("LLM returned malformed JSON") from e
    if not isinstance(parsed, dict):
        log.error("LLM returned non-object JSON for %s: %r", symbol, parsed)
        raise AnalysisError("LLM JSON was not an object")
    return parsed


def analyze_quote(symbol: str, quote: QuoteData) -> AnalysisResult:
    s = get_settings()
    user_message = _build_user_message(symbol, quote)

    kwargs: dict = {
        "model": s.openai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.2,
        "max_tokens": s.llm_max_tokens,
    }
    if s.llm_response_format == "json_schema":
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "stock_analysis",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "sentiment": {"type": "string", "enum": ["Bullish", "Neutral", "Bearish"]},
                        "risk_level": {"type": "string", "enum": ["Low", "Medium", "High"]},
                    },
                    "required": ["summary", "sentiment", "risk_level"],
                    "additionalProperties": False,
                },
            },
        }
    else:
        kwargs["response_format"] = {"type": "json_object"}

    start = time.monotonic()
    try:
        response = _client().chat.completions.create(**kwargs)
    except OpenAIError as e:
        # Do NOT log the full exception traceback here — the SDK may embed
        # request details. The generic message keeps logs clean.
        log.warning("LLM call failed for %s: %s", symbol, e)
        raise AnalysisError("LLM upstream call failed") from e
    elapsed_ms = (time.monotonic() - start) * 1000

    choice = response.choices[0]
    finish_reason = choice.finish_reason
    raw = choice.message.content or ""

    usage = response.usage
    log.info(
        "llm model=%s latency_ms=%.0f finish_reason=%s prompt_tokens=%s completion_tokens=%s",
        s.openai_model,
        elapsed_ms,
        finish_reason,
        usage.prompt_tokens if usage else None,
        usage.completion_tokens if usage else None,
    )

    if finish_reason == "length":
        log.warning("LLM output truncated (finish_reason=length) for %s", symbol)
        raise AnalysisError("LLM output truncated")

    parsed = _parse_json(raw, symbol)
    result = _validate(parsed, symbol)
    log.info("analysis ok symbol=%s sentiment=%s risk=%s", symbol, result.sentiment, result.risk_level)
    return result


def _validate(parsed: dict, symbol: str) -> AnalysisResult:
    """Normalize sloppy-but-valid casing before the strict model validation.

    ``sentiment`` and ``risk_level`` are title-cased so a value like
    ``bullish`` or ``"high"`` still passes the Literal instead of being
    rejected and costing the user a retry. The caller's dict is not mutated.
    """
    normalized = dict(parsed)
    for key in ("sentiment", "risk_level"):
        if isinstance(normalized.get(key), str):
            normalized[key] = normalized[key].strip().title()
    try:
        return AnalysisResult.model_validate(normalized)
    except ValidationError as e:
        log.error(
            "LLM JSON failed schema for %s: parsed=%.2000s errors=%s",
            symbol,
            json.dumps(normalized),
            e.errors(),
        )
        raise AnalysisError("LLM JSON did not match required schema") from e
