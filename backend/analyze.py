from __future__ import annotations

import json
import logging
from json import JSONDecodeError

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from config import get_settings
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
    return OpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url)


def analyze_quote(symbol: str, quote: QuoteData) -> AnalysisResult:
    s = get_settings()
    user_message = _build_user_message(symbol, quote)

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
    except OpenAIError as e:
        log.exception("LLM call failed for %s", symbol)
        raise AnalysisError("LLM upstream call failed") from e

    raw = response.choices[0].message.content or ""

    try:
        parsed = json.loads(raw)
    except JSONDecodeError as e:
        log.error("LLM returned non-JSON for %s: %r", symbol, raw)
        raise AnalysisError("LLM returned malformed JSON") from e

    try:
        return AnalysisResult.model_validate(parsed)
    except ValidationError as e:
        log.error("LLM JSON failed schema for %s: %r — errors=%s", symbol, parsed, e.errors())
        raise AnalysisError("LLM JSON did not match required schema") from e
