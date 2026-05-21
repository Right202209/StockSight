from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from analyze import AnalysisError, analyze_quote
from config import get_settings
from db import init_db, insert_analysis, list_history
from quote import QuoteError, fetch_quote
from schemas import AnalyzeRequest, normalize_symbol

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("stocksight")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info("DB initialized at %s", get_settings().sqlite_path)
    yield


app = FastAPI(title="StockSight AI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/quote")
def get_quote(symbol: str = Query(min_length=1, max_length=10)) -> dict:
    try:
        sym = normalize_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        quote = fetch_quote(sym)
    except QuoteError as e:
        log.warning("quote failed for %s: %s", sym, e)
        raise HTTPException(status_code=502, detail="Failed to fetch quote, please try again.")
    return quote.model_dump()


@app.post("/api/analyze")
def post_analyze(req: AnalyzeRequest) -> dict:
    sym = req.symbol
    if req.quote_data.symbol.upper() != sym:
        raise HTTPException(status_code=400, detail="symbol and quote_data.symbol must match")
    try:
        result = analyze_quote(sym, req.quote_data)
    except AnalysisError as e:
        log.warning("analyze failed for %s: %s", sym, e)
        return JSONResponse(
            status_code=502,
            content={"error": "AI analysis failed. Please try again."},
        )
    row_id = insert_analysis(sym, req.quote_data, result)
    return {"id": row_id, **result.model_dump()}


@app.get("/api/history")
def get_history(
    symbol: str | None = Query(default=None, max_length=10),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    sym = None
    if symbol:
        try:
            sym = normalize_symbol(symbol)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    items = list_history(sym, limit)
    return {"items": [it.model_dump() for it in items]}
