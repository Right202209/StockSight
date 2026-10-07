from __future__ import annotations

import json
import logging
from json import JSONDecodeError
from threading import BoundedSemaphore

from config import get_settings
from openai import OpenAI, OpenAIError
from pydantic import ValidationError
from schemas import AnalysisResult, QuoteData

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a professional financial analyst AI.
Your task is to analyze the given real-time stock quote data and output a strict JSON object.
Your response must contain ONLY a valid JSON object (no markdown code fences, no extra text).
The JSON must have exactly these three fields:
- "summary": A concise one-sentence summary of the stock's current performance (string).
- "sentiment": One of "Bullish", "Neutral", or "Bearish" (string).
- "risk_level": A risk assessment, e.g., "Low", "Medium", or "High" (string).

Do not include any additional keys. Do not wrap the JSON in code blocks. Do not provide explanations.
Example of valid output:
{"summary": "AAPL is up 2.3% on strong volume, breaking above 20-day moving average.", "sentiment": "Bullish", "risk_level": "Medium"}"""

USER_TEMPLATE = """Analyze the following stock data and produce the required JSON:

Symbol: {symbol}
Current Price: {price}
Change: {change} ({change_percent}%)
Day High: {high}
Day Low: {low}
Volume: {volume}
Previous Close: {previous_close}
Market State: {market_state}"""


class AnalysisError(Exception):
    """Raised when the LLM fails or returns malformed output."""


class AnalysisBusyError(AnalysisError):
    """Raised when all model-call slots are occupied."""


_semaphore: BoundedSemaphore | None = None
_semaphore_size = 0


def _call_semaphore() -> BoundedSemaphore:
    global _semaphore, _semaphore_size
    size = get_settings().analyze_concurrency
    if _semaphore is None or _semaphore_size != size:
        _semaphore = BoundedSemaphore(size)
        _semaphore_size = size
    return _semaphore


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


def _client() -> OpenAI:
    s = get_settings()
    if not s.openai_api_key:
        raise AnalysisError("OPENAI_API_KEY is not configured")
    return OpenAI(
        api_key=s.openai_api_key,
        base_url=s.openai_base_url,
        timeout=s.openai_timeout_seconds,
        max_retries=0,
    )


def analyze_quote(symbol: str, quote: QuoteData) -> AnalysisResult:
    s = get_settings()
    user_message = _build_user_message(symbol, quote)

    semaphore = _call_semaphore()
    if not semaphore.acquire(blocking=False):
        raise AnalysisBusyError("analysis capacity is temporarily exhausted")
    try:
        try:
            response = _client().chat.completions.create(
                model=s.openai_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
        except (OpenAIError, TimeoutError, ValueError) as e:
            log.warning("LLM call failed for %s: %s", symbol, e)
            raise AnalysisError("LLM upstream call failed") from e

        try:
            raw = response.choices[0].message.content or ""
        except (AttributeError, IndexError, TypeError) as e:
            raise AnalysisError("LLM returned no usable choices") from e
    finally:
        semaphore.release()

    if not isinstance(raw, str):
        log.error("LLM returned non-text content for %s: %r", symbol, type(raw).__name__)
        raise AnalysisError("LLM returned malformed content")

    try:
        parsed = json.loads(raw)
    except JSONDecodeError as e:
        log.error("LLM returned non-JSON for %s (content_length=%d)", symbol, len(raw))
        raise AnalysisError("LLM returned malformed JSON") from e

    try:
        return AnalysisResult.model_validate(parsed)
    except ValidationError as e:
        keys = sorted(str(key)[:80] for key in parsed)[:20] if isinstance(parsed, dict) else [type(parsed).__name__]
        issues = [{"loc": error.get("loc"), "type": error.get("type")} for error in e.errors()]
        log.error("LLM JSON failed schema for %s (keys=%s, issues=%s)", symbol, keys, issues)
        raise AnalysisError("LLM JSON did not match required schema") from e
