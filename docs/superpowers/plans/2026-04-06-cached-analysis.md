# Pre-computed Analysis Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-compute agent analysis for scanner tickers every 5 minutes so users see instant results.

**Architecture:** Backend gets a Postgres cache table, a Python scanner module (replicating the frontend's scoring math), and an asyncio scheduler that runs the orchestrator for top-scoring tickers. Frontend fetches cached results on page load, falls back to manual analysis. Also fixes trade_rec JSON parsing bug (0 recommendations).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, httpx, LangGraph, pytest. Frontend: Next.js, TypeScript.

**Repos:**
- Backend: `/Users/ianrahwan/Documents/Projects/quant-agent-backend`
- Frontend: `/Users/ianrahwan/Documents/Projects/quant-agent-service`

---

## File Map

### Backend (quant-agent-backend)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `alembic/versions/001_add_cached_analyses.py` | Migration for cached_analyses table |
| Create | `db/models.py` (add class) | CachedAnalysis ORM model |
| Create | `data/cache_repo.py` | upsert / get / delete_stale functions |
| Modify | `graphs/trader/nodes/trade_rec.py` | Strip markdown fences before JSON parse |
| Create | `app/scanner/__init__.py` | Package init |
| Create | `app/scanner/market_data.py` | Fetch quotes, options, history, VIX from Yahoo Finance |
| Create | `app/scanner/greeks.py` | Black-Scholes gamma, vanna, charm |
| Create | `app/scanner/criteria.py` | 6 scoring functions |
| Create | `app/scanner/engine.py` | runScan() orchestrator |
| Create | `app/scanner/universe.py` | Ticker list constant |
| Create | `app/scheduler.py` | Background refresh loop |
| Create | `app/routes/cached.py` | GET /cached/{symbol} endpoint |
| Modify | `app/routes/analysis.py` | Write-through to cache on completion |
| Modify | `app/main.py` | Start scheduler, register cached route, create session factory |
| Modify | `app/dependencies.py` | Add get_session dependency |
| Create | `tests/test_cache_repo.py` | Cache repo unit tests |
| Create | `tests/test_trade_rec_parse.py` | Markdown fence stripping test |
| Create | `tests/test_scanner/test_criteria.py` | Scoring math tests |
| Create | `tests/test_routes/test_cached.py` | Cached endpoint tests |

### Frontend (quant-agent-service)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/agent/cached/[symbol]/route.ts` | Proxy to backend GET /cached/{symbol} |
| Modify | `src/lib/agent-types.ts` | Add CachedAnalysis type |
| Modify | `src/hooks/useAgentAnalysis.ts` | Fetch cached on mount, add cachedAt state |
| Modify | `src/components/detail/AgentPanel.tsx` | Show cache indicator, relabel button |

---

## Task 1: Fix Trade Rec JSON Parsing

**Repo:** quant-agent-backend
**Files:**
- Modify: `graphs/trader/nodes/trade_rec.py:57-67`
- Create: `tests/test_trade_rec_parse.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_trade_rec_parse.py
import json
import re

import pytest

from graphs.trader.nodes.trade_rec import _strip_code_fences


FENCED_JSON = '''```json
[{"strategy":"calendar_spread","direction":"long_vol","legs":[{"action":"buy","expiry":"2026-05-15","strike":45,"type":"call"}],"rationale":"Backwardation favors near-term long vol","estimated_greeks":{"delta":0.05,"vega":12.3,"theta":-0.8},"risk_reward":"1:3"}]
```'''

PLAIN_JSON = '[{"strategy":"straddle","direction":"long_vol","legs":[],"rationale":"t","estimated_greeks":{"delta":0,"vega":1,"theta":-1},"risk_reward":"1:2"}]'

FENCED_NO_LANG = '''```
[{"strategy":"straddle","direction":"long_vol","legs":[],"rationale":"t","estimated_greeks":{"delta":0,"vega":1,"theta":-1},"risk_reward":"1:2"}]
```'''


def test_strip_fenced_json():
    result = _strip_code_fences(FENCED_JSON)
    parsed = json.loads(result)
    assert len(parsed) == 1
    assert parsed[0]["strategy"] == "calendar_spread"


def test_plain_json_unchanged():
    result = _strip_code_fences(PLAIN_JSON)
    parsed = json.loads(result)
    assert len(parsed) == 1
    assert parsed[0]["strategy"] == "straddle"


def test_fenced_no_language_tag():
    result = _strip_code_fences(FENCED_NO_LANG)
    parsed = json.loads(result)
    assert len(parsed) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run pytest tests/test_trade_rec_parse.py -v`
Expected: FAIL — `_strip_code_fences` not found

- [ ] **Step 3: Add `_strip_code_fences` and update `trade_rec_node`**

In `graphs/trader/nodes/trade_rec.py`, add after the imports:

```python
import re

def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences Claude often wraps JSON in."""
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return cleaned.strip()
```

Then update the parsing in `trade_rec_node` (around line 65):

```python
    try:
        cleaned = _strip_code_fences(response)
        recs_data = json.loads(cleaned)
        trade_recs = [TradeRecommendation(**r) for r in recs_data]
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("trade_rec.parse_error", error=str(exc), response=response[:200])
        trade_recs = []
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_trade_rec_parse.py -v`
Expected: 3 passed

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest -x -q`
Expected: All pass

- [ ] **Step 6: Format and commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
uv run ruff format graphs/trader/nodes/trade_rec.py tests/test_trade_rec_parse.py
git add graphs/trader/nodes/trade_rec.py tests/test_trade_rec_parse.py
git commit -m "fix: strip markdown code fences from trade rec JSON response"
```

---

## Task 2: CachedAnalysis ORM Model + Alembic Migration

**Repo:** quant-agent-backend
**Files:**
- Modify: `db/models.py`
- Create: `alembic/versions/001_add_cached_analyses.py`

- [ ] **Step 1: Add CachedAnalysis model to db/models.py**

Add at the end of `db/models.py`:

```python
class CachedAnalysis(Base):
    """Pre-computed analysis results for instant loading."""

    __tablename__ = "cached_analyses"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    scanner_signals: Mapped[dict] = mapped_column(JSON, nullable=False)
    narrative: Mapped[str] = mapped_column(Text, nullable=False, default="")
    trade_recs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    vol_surface: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    phases_log: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    total_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
```

Add these imports at the top of `db/models.py` if not already present:

```python
from sqlalchemy import JSON, Float, DateTime, func
```

- [ ] **Step 2: Generate Alembic migration**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run alembic revision --autogenerate -m "add cached_analyses table"`

This will create a file in `alembic/versions/`. Verify the generated migration contains:
- `CREATE TABLE cached_analyses` with all columns
- `CREATE INDEX idx_cached_analyses_created_at`

If the index isn't auto-generated, add it manually to the `upgrade()`:

```python
op.create_index("idx_cached_analyses_created_at", "cached_analyses", ["created_at"])
```

- [ ] **Step 3: Run full test suite**

Run: `uv run pytest -x -q`
Expected: All pass (migration file doesn't affect tests)

- [ ] **Step 4: Format and commit**

```bash
uv run ruff format db/models.py
git add db/models.py alembic/versions/
git commit -m "feat: add CachedAnalysis model and Alembic migration"
```

---

## Task 3: Cache Repository

**Repo:** quant-agent-backend
**Files:**
- Create: `data/cache_repo.py`
- Create: `tests/test_cache_repo.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_cache_repo.py
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from data.cache_repo import upsert_cached_analysis, get_cached_analysis, delete_stale_analyses


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    return session


async def test_upsert_cached_analysis(mock_session):
    await upsert_cached_analysis(
        session=mock_session,
        symbol="SPY",
        scanner_signals={"iv_percentile": 0.85, "composite": 0.7},
        narrative="Test narrative",
        trade_recs=[{"strategy": "straddle"}],
        vol_surface={"regime": "flat"},
        phases_log=["phase 1", "phase 2"],
        total_time=23.5,
    )
    mock_session.execute.assert_called_once()
    mock_session.commit.assert_called_once()


async def test_get_cached_analysis_found(mock_session):
    mock_row = MagicMock()
    mock_row.symbol = "SPY"
    mock_row.narrative = "Test"
    mock_row.created_at = datetime.now(UTC)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_row
    mock_session.execute.return_value = mock_result

    result = await get_cached_analysis(mock_session, "SPY")
    assert result is not None
    assert result.symbol == "SPY"


async def test_get_cached_analysis_not_found(mock_session):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    result = await get_cached_analysis(mock_session, "UNKNOWN")
    assert result is None


async def test_delete_stale_analyses(mock_session):
    await delete_stale_analyses(mock_session, max_age_seconds=3600)
    mock_session.execute.assert_called_once()
    mock_session.commit.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_cache_repo.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cache_repo.py**

```python
# data/cache_repo.py
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import CachedAnalysis


async def upsert_cached_analysis(
    session: AsyncSession,
    symbol: str,
    scanner_signals: dict,
    narrative: str,
    trade_recs: list,
    vol_surface: dict | None,
    phases_log: list,
    total_time: float | None,
) -> None:
    """Insert or update cached analysis for a ticker."""
    stmt = insert(CachedAnalysis).values(
        symbol=symbol,
        scanner_signals=scanner_signals,
        narrative=narrative,
        trade_recs=trade_recs,
        vol_surface=vol_surface,
        phases_log=phases_log,
        total_time=total_time,
        created_at=datetime.now(UTC),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol"],
        set_={
            "scanner_signals": stmt.excluded.scanner_signals,
            "narrative": stmt.excluded.narrative,
            "trade_recs": stmt.excluded.trade_recs,
            "vol_surface": stmt.excluded.vol_surface,
            "phases_log": stmt.excluded.phases_log,
            "total_time": stmt.excluded.total_time,
            "created_at": stmt.excluded.created_at,
        },
    )
    await session.execute(stmt)
    await session.commit()


async def get_cached_analysis(
    session: AsyncSession,
    symbol: str,
) -> CachedAnalysis | None:
    """Get cached analysis for a ticker, or None if not found."""
    stmt = select(CachedAnalysis).where(CachedAnalysis.symbol == symbol)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def delete_stale_analyses(
    session: AsyncSession,
    max_age_seconds: int = 3600,
) -> None:
    """Delete cached analyses older than max_age_seconds."""
    cutoff = datetime.now(UTC) - timedelta(seconds=max_age_seconds)
    stmt = delete(CachedAnalysis).where(CachedAnalysis.created_at < cutoff)
    await session.execute(stmt)
    await session.commit()
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_cache_repo.py -v`
Expected: 4 passed

- [ ] **Step 5: Format and commit**

```bash
uv run ruff format data/cache_repo.py tests/test_cache_repo.py
git add data/cache_repo.py tests/test_cache_repo.py
git commit -m "feat: add cache repository for cached_analyses CRUD"
```

---

## Task 4: Scanner Module — Market Data + Greeks + Criteria

**Repo:** quant-agent-backend
**Files:**
- Create: `app/scanner/__init__.py`
- Create: `app/scanner/universe.py`
- Create: `app/scanner/market_data.py`
- Create: `app/scanner/greeks.py`
- Create: `app/scanner/criteria.py`
- Create: `app/scanner/engine.py`
- Create: `tests/test_scanner/test_criteria.py`

This is the largest task. It replicates the frontend scanner scoring math in Python.

- [ ] **Step 1: Create universe.py**

```python
# app/scanner/universe.py
SCANNER_UNIVERSE: list[str] = [
    # Indices
    "SPY", "QQQ", "IWM", "DIA", "EFA", "EEM",
    # Mega-caps
    "AAPL", "MSFT", "AMZN", "GOOGL", "TSLA", "NVDA", "META",
    "JPM", "BAC", "GS", "XOM", "CVX",
    # Commodities
    "GLD", "SLV", "USO", "UNG", "DBA", "WEAT", "CORN",
    # Sectors
    "XLE", "XLF", "XLK", "XLV", "XLU", "XLI", "XLB",
    # High-vol
    "COIN", "MARA", "RIVN", "ARM",
]

INDEX_SYMBOLS = {"SPY", "QQQ", "IWM", "DIA", "EFA", "EEM"}
```

- [ ] **Step 2: Create greeks.py**

```python
# app/scanner/greeks.py
"""Black-Scholes Greeks for scanner scoring."""
import math

_SQRT_2PI = math.sqrt(2 * math.pi)
_R = 0.05  # risk-free rate


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT_2PI


def _norm_cdf(x: float) -> float:
    """Abramowitz & Stegun approximation."""
    sign = -1.0 if x < 0 else 1.0
    ax = abs(x)
    t = 1.0 / (1.0 + 0.3275911 * ax)
    y = 1.0 - (
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
        * t
        * math.exp(-ax * ax / 2.0)
    )
    return 0.5 * (1.0 + sign * y)


def _d1(s: float, k: float, t: float, sigma: float) -> float:
    return (math.log(s / k) + (_R + 0.5 * sigma * sigma) * t) / (sigma * math.sqrt(t))


def gamma_bs(s: float, k: float, t: float, sigma: float) -> float:
    """BS gamma: d^2C/dS^2."""
    if t <= 0 or sigma <= 0:
        return 0.0
    d = _d1(s, k, t, sigma)
    return _norm_pdf(d) / (s * sigma * math.sqrt(t))


def vanna_bs(s: float, k: float, t: float, sigma: float) -> float:
    """BS vanna: dDelta/dVol."""
    if t <= 0 or sigma <= 0:
        return 0.0
    d = _d1(s, k, t, sigma)
    d2 = d - sigma * math.sqrt(t)
    return -d2 * _norm_pdf(d) / sigma


def charm_bs(s: float, k: float, t: float, sigma: float) -> float:
    """BS charm: dDelta/dTime."""
    if t <= 0 or sigma <= 0:
        return 0.0
    sqrt_t = math.sqrt(t)
    d = _d1(s, k, t, sigma)
    d2 = d - sigma * sqrt_t
    return -_norm_pdf(d) * (2 * _R * t - d2 * sigma * sqrt_t) / (2 * t * sigma * sqrt_t)
```

- [ ] **Step 3: Create market_data.py**

```python
# app/scanner/market_data.py
"""Fetch market data from Yahoo Finance for scanner scoring."""
import math
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import structlog

logger = structlog.get_logger()

_YF_BASE = "https://query1.finance.yahoo.com/v8/finance"
_HEADERS = {"User-Agent": "Mozilla/5.0"}
_TIMEOUT = 15.0


@dataclass
class QuoteData:
    symbol: str
    price: float


@dataclass
class OptionContract:
    strike: float
    expiry_epoch: int
    type: str  # "call" | "put"
    implied_vol: float
    open_interest: int


@dataclass
class OptionsChainData:
    symbol: str
    contracts: list[OptionContract]
    expirations: list[int]  # epoch timestamps


@dataclass
class VixTermStructure:
    vix: float
    vix3m: float
    backwardation_ratio: float


async def get_quote(client: httpx.AsyncClient, symbol: str) -> QuoteData | None:
    """Fetch current price for a symbol."""
    try:
        url = f"{_YF_BASE}/finance/quote"
        resp = await client.get(url, params={"symbols": symbol}, headers=_HEADERS, timeout=_TIMEOUT)
        data = resp.json()
        result = data.get("quoteResponse", {}).get("result", [])
        if not result:
            return None
        q = result[0]
        return QuoteData(symbol=symbol, price=q.get("regularMarketPrice", 0))
    except Exception as exc:
        logger.warning("market_data.quote_failed", symbol=symbol, error=str(exc))
        return None


async def get_options_chain(client: httpx.AsyncClient, symbol: str) -> OptionsChainData | None:
    """Fetch options chain (all available expirations)."""
    try:
        url = f"https://query1.finance.yahoo.com/v7/finance/options/{symbol}"
        # First call to get available expirations
        resp = await client.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        data = resp.json()
        chain = data.get("optionChain", {}).get("result", [])
        if not chain:
            return None

        expirations = chain[0].get("expirationDates", [])[:7]  # nearest 7
        contracts: list[OptionContract] = []

        for exp in expirations:
            resp = await client.get(url, params={"date": exp}, headers=_HEADERS, timeout=_TIMEOUT)
            exp_data = resp.json().get("optionChain", {}).get("result", [])
            if not exp_data:
                continue
            options = exp_data[0].get("options", [])
            if not options:
                continue
            opt = options[0]
            for call in opt.get("calls", []):
                iv = call.get("impliedVolatility", 0)
                if iv > 0:
                    contracts.append(OptionContract(
                        strike=call["strike"],
                        expiry_epoch=exp,
                        type="call",
                        implied_vol=iv,
                        open_interest=call.get("openInterest", 0),
                    ))
            for put in opt.get("puts", []):
                iv = put.get("impliedVolatility", 0)
                if iv > 0:
                    contracts.append(OptionContract(
                        strike=put["strike"],
                        expiry_epoch=exp,
                        type="put",
                        implied_vol=iv,
                        open_interest=put.get("openInterest", 0),
                    ))

        return OptionsChainData(symbol=symbol, contracts=contracts, expirations=expirations)
    except Exception as exc:
        logger.warning("market_data.options_failed", symbol=symbol, error=str(exc))
        return None


async def get_historical_prices(client: httpx.AsyncClient, symbol: str) -> list[float]:
    """Fetch 1 year of daily closing prices."""
    try:
        url = f"{_YF_BASE}/finance/chart/{symbol}"
        resp = await client.get(
            url,
            params={"range": "1y", "interval": "1d"},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return []
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        return [c for c in closes if c is not None]
    except Exception as exc:
        logger.warning("market_data.history_failed", symbol=symbol, error=str(exc))
        return []


async def get_vix_term_structure(client: httpx.AsyncClient) -> VixTermStructure | None:
    """Fetch VIX and VIX3M for term structure ratio."""
    try:
        url = f"{_YF_BASE}/finance/quote"
        resp = await client.get(url, params={"symbols": "^VIX,^VIX3M"}, headers=_HEADERS, timeout=_TIMEOUT)
        data = resp.json()
        results = data.get("quoteResponse", {}).get("result", [])
        prices = {r["symbol"]: r.get("regularMarketPrice", 0) for r in results}
        vix = prices.get("^VIX", 0)
        vix3m = prices.get("^VIX3M", 0)
        if vix <= 0 or vix3m <= 0:
            return None
        return VixTermStructure(vix=vix, vix3m=vix3m, backwardation_ratio=vix / vix3m)
    except Exception as exc:
        logger.warning("market_data.vix_failed", error=str(exc))
        return None
```

- [ ] **Step 4: Create criteria.py**

```python
# app/scanner/criteria.py
"""Six scoring criteria matching the frontend scanner math."""
import math

from app.scanner.greeks import gamma_bs, vanna_bs, charm_bs
from app.scanner.market_data import OptionsChainData, VixTermStructure


def _days_to_expiry(expiry_epoch: int) -> float:
    import time
    return max(0, (expiry_epoch - time.time()) / 86400)


def _atm_iv(chain: OptionsChainData, spot: float, expiry_epoch: int | None = None) -> float:
    """Find ATM IV from the nearest (or specified) expiration."""
    target_exp = expiry_epoch or (min(chain.expirations) if chain.expirations else 0)
    calls = [c for c in chain.contracts if c.type == "call" and c.expiry_epoch == target_exp]
    if not calls:
        return 0.0
    closest = min(calls, key=lambda c: abs(c.strike - spot))
    return closest.implied_vol


def _rolling_realized_vol(prices: list[float], window: int = 30) -> list[float]:
    """Compute rolling realized vol (annualized) from closing prices."""
    if len(prices) < window + 1:
        return []
    log_returns = [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    vols = []
    for i in range(window, len(log_returns) + 1):
        chunk = log_returns[i - window : i]
        mean = sum(chunk) / len(chunk)
        var = sum((r - mean) ** 2 for r in chunk) / len(chunk)
        vols.append(math.sqrt(var) * math.sqrt(252))
    return vols


def score_iv_percentile(chain: OptionsChainData, prices: list[float], spot: float) -> float:
    """Criterion 1: IV percentile vs historical realized vol. Weight: 0.25."""
    if len(prices) < 60 or not chain.contracts:
        return 0.0
    current_iv = _atm_iv(chain, spot)
    if current_iv <= 0:
        return 0.0
    hist_vols = _rolling_realized_vol(prices)
    if len(hist_vols) < 20:
        return 0.0
    vol_mean = sum(hist_vols) / len(hist_vols)
    vol_std = max(0.01, math.sqrt(sum((v - vol_mean) ** 2 for v in hist_vols) / len(hist_vols)))
    z = (current_iv - vol_mean) / vol_std
    percentile = max(0.0, min(1.0, 0.5 + z * 0.2))
    return max(0.0, min(1.0, 1.0 - percentile))


def score_skew_kurtosis(chain: OptionsChainData, prices: list[float], spot: float) -> float:
    """Criterion 2: Negative skew + fat tails. Weight: 0.20."""
    if len(prices) < 61 or not chain.contracts:
        return 0.0
    atm = _atm_iv(chain, spot)
    # 25-delta put proxy: strike at 95% of spot
    target_exp = min(chain.expirations) if chain.expirations else 0
    puts = [c for c in chain.contracts if c.type == "put" and c.expiry_epoch == target_exp]
    put_target = spot * 0.95
    put_iv = min(puts, key=lambda c: abs(c.strike - put_target)).implied_vol if puts else atm
    put_skew = put_iv - atm

    log_returns = [math.log(prices[i] / prices[i - 1]) for i in range(max(1, len(prices) - 60), len(prices))]
    if len(log_returns) < 20:
        return 0.0
    avg = sum(log_returns) / len(log_returns)
    std = max(1e-10, math.sqrt(sum((r - avg) ** 2 for r in log_returns) / len(log_returns)))
    m4 = sum(((r - avg) / std) ** 4 for r in log_returns) / len(log_returns)
    kurtosis = m4 - 3.0

    skew_score = max(0.0, min(1.0, put_skew / 0.15))
    kurt_score = max(0.0, min(1.0, kurtosis / 5.0))
    mismatch = (kurt_score - skew_score) * 0.3 if kurt_score > skew_score else 0.0
    return min(1.0, 0.35 * skew_score + 0.35 * kurt_score + 0.30 * (skew_score + kurt_score) / 2 + mismatch)


def score_dealer_gamma(chain: OptionsChainData, spot: float) -> float:
    """Criterion 3: Dealer short gamma. Weight: 0.20."""
    if not chain.contracts:
        return 0.0
    total_gex = 0.0
    for c in chain.contracts:
        t = _days_to_expiry(c.expiry_epoch) / 365.0
        if t <= 0 or c.implied_vol <= 0:
            continue
        g = gamma_bs(spot, c.strike, t, c.implied_vol)
        total_gex -= g * c.open_interest * 100 * spot
    normalized = -total_gex / (abs(total_gex) + 1e8)
    return max(0.0, min(1.0, 0.5 + normalized * 0.5))


def score_term_structure(
    chain: OptionsChainData, spot: float, vix: VixTermStructure | None, is_index: bool
) -> float:
    """Criterion 4: Term structure backwardation. Weight: 0.15."""
    if is_index and vix:
        ratio = vix.backwardation_ratio
    elif len(chain.expirations) >= 2:
        near_iv = _atm_iv(chain, spot, chain.expirations[0])
        far_iv = _atm_iv(chain, spot, chain.expirations[-1])
        ratio = near_iv / far_iv if far_iv > 0 else 1.0
    else:
        return 0.1

    if ratio > 1.15:
        return 1.0
    elif ratio > 1.0:
        return 0.5 + (ratio - 1.0) / 0.15 * 0.5
    elif ratio > 0.95:
        return 0.3 + (ratio - 0.95) / 0.05 * 0.2
    elif ratio > 0.85:
        return 0.1 + (ratio - 0.85) / 0.10 * 0.2
    return 0.1


def score_vanna(chain: OptionsChainData, spot: float) -> float:
    """Criterion 5: Vanna exposure. Weight: 0.10."""
    if not chain.contracts:
        return 0.0
    total = 0.0
    for c in chain.contracts:
        t = _days_to_expiry(c.expiry_epoch) / 365.0
        if t <= 0 or c.implied_vol <= 0:
            continue
        v = vanna_bs(spot, c.strike, t, c.implied_vol)
        total -= v * c.open_interest * 100
    normalized = -total / (abs(total) + 1e6)
    return max(0.0, min(1.0, 0.5 + normalized * 0.5))


def score_charm(chain: OptionsChainData, spot: float) -> float:
    """Criterion 6: Charm exposure. Weight: 0.10."""
    if not chain.contracts:
        return 0.0
    total = 0.0
    for c in chain.contracts:
        t = _days_to_expiry(c.expiry_epoch) / 365.0
        if t <= 0 or c.implied_vol <= 0:
            continue
        ch = charm_bs(spot, c.strike, t, c.implied_vol)
        total -= ch * c.open_interest * 100
    magnitude = abs(total)
    normalized = magnitude / (magnitude + 1e5)
    return max(0.0, min(1.0, normalized))
```

- [ ] **Step 5: Create engine.py**

```python
# app/scanner/engine.py
"""Scanner engine: fetch data, score, return top tickers with signals."""
import asyncio

import httpx
import structlog

from app.scanner.criteria import (
    score_charm,
    score_dealer_gamma,
    score_iv_percentile,
    score_skew_kurtosis,
    score_term_structure,
    score_vanna,
)
from app.scanner.market_data import get_options_chain, get_quote, get_historical_prices, get_vix_term_structure
from app.scanner.universe import INDEX_SYMBOLS, SCANNER_UNIVERSE
from models.common import ScannerSignals

logger = structlog.get_logger()

WEIGHTS = {
    "iv_percentile": 0.25,
    "skew_kurtosis": 0.20,
    "dealer_gamma": 0.20,
    "term_structure": 0.15,
    "vanna": 0.10,
    "charm": 0.10,
}

COMPOSITE_THRESHOLD = 0.4


async def run_scan() -> list[tuple[str, ScannerSignals]]:
    """Score all universe tickers and return those above threshold."""
    async with httpx.AsyncClient() as client:
        vix = await get_vix_term_structure(client)
        results: list[tuple[str, ScannerSignals]] = []

        for symbol in SCANNER_UNIVERSE:
            try:
                quote, chain, prices = await asyncio.gather(
                    get_quote(client, symbol),
                    get_options_chain(client, symbol),
                    get_historical_prices(client, symbol),
                )
                if not quote or not chain or len(prices) < 60:
                    continue

                spot = quote.price
                is_index = symbol in INDEX_SYMBOLS

                scores = {
                    "iv_percentile": score_iv_percentile(chain, prices, spot),
                    "skew_kurtosis": score_skew_kurtosis(chain, prices, spot),
                    "dealer_gamma": score_dealer_gamma(chain, spot),
                    "term_structure": score_term_structure(chain, spot, vix, is_index),
                    "vanna": score_vanna(chain, spot),
                    "charm": score_charm(chain, spot),
                }

                composite = round(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 3)

                if composite >= COMPOSITE_THRESHOLD:
                    signals = ScannerSignals(composite=composite, **scores)
                    results.append((symbol, signals))

                await asyncio.sleep(0.05)  # rate limit

            except Exception as exc:
                logger.warning("scanner.symbol_failed", symbol=symbol, error=str(exc))

        results.sort(key=lambda x: x[1].composite, reverse=True)
        return results
```

- [ ] **Step 6: Create `__init__.py`**

```python
# app/scanner/__init__.py
```

(Empty file)

- [ ] **Step 7: Write scoring math tests**

```python
# tests/test_scanner/test_criteria.py
import math

import pytest

from app.scanner.criteria import _rolling_realized_vol, score_iv_percentile
from app.scanner.greeks import gamma_bs, vanna_bs, charm_bs


def test_rolling_realized_vol_basic():
    """Constant prices → zero vol."""
    prices = [100.0] * 50
    vols = _rolling_realized_vol(prices, window=30)
    assert len(vols) > 0
    assert all(v == pytest.approx(0.0, abs=1e-10) for v in vols)


def test_rolling_realized_vol_too_short():
    prices = [100.0] * 10
    vols = _rolling_realized_vol(prices, window=30)
    assert vols == []


def test_gamma_bs_positive():
    """Gamma should always be positive."""
    g = gamma_bs(s=100, k=100, t=0.25, sigma=0.3)
    assert g > 0


def test_gamma_bs_zero_time():
    g = gamma_bs(s=100, k=100, t=0, sigma=0.3)
    assert g == 0.0


def test_vanna_bs_atm():
    """ATM vanna should be non-zero."""
    v = vanna_bs(s=100, k=100, t=0.25, sigma=0.3)
    assert v != 0.0


def test_charm_bs_atm():
    """ATM charm should be non-zero."""
    c = charm_bs(s=100, k=100, t=0.25, sigma=0.3)
    assert c != 0.0
```

Also create `tests/test_scanner/__init__.py` (empty).

- [ ] **Step 8: Run tests**

Run: `uv run pytest tests/test_scanner/ -v`
Expected: 6 passed

- [ ] **Step 9: Format and commit**

```bash
uv run ruff format app/scanner/ tests/test_scanner/
git add app/scanner/ tests/test_scanner/
git commit -m "feat: add Python scanner module with market data, Greeks, and scoring criteria"
```

---

## Task 5: Session Dependency + GET /cached Endpoint

**Repo:** quant-agent-backend
**Files:**
- Modify: `app/dependencies.py`
- Modify: `app/main.py`
- Create: `app/routes/cached.py`
- Create: `tests/test_routes/test_cached.py`

- [ ] **Step 1: Add session factory to app state and dependency**

In `app/dependencies.py`, add:

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from fastapi import Request


async def get_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session from the app-level factory."""
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        yield session
```

In `app/main.py`, update the lifespan to create and store the session factory:

```python
from db.session import create_session_factory
```

Add inside `lifespan()`, after the pgvector extension creation and before `yield`:

```python
    app.state.session_factory = create_session_factory(settings.effective_database_url)
```

Also in `create_app()`, add the cached router import and include:

```python
from app.routes import analysis, cached, discovery, health, sources, stream
# ...
app.include_router(cached.router)
```

- [ ] **Step 2: Write test for GET /cached endpoint**

```python
# tests/test_routes/test_cached.py
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from sse.bus import InMemorySSEBus


@pytest.fixture
def app():
    a = create_app()
    a.state.sse_bus = InMemorySSEBus()
    a.state.session_factory = MagicMock()
    return a


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@patch("app.routes.cached.get_cached_analysis")
async def test_cached_found(mock_get, client):
    mock_row = MagicMock()
    mock_row.symbol = "SPY"
    mock_row.narrative = "Test narrative"
    mock_row.trade_recs = [{"strategy": "straddle"}]
    mock_row.vol_surface = {"regime": "flat"}
    mock_row.phases_log = ["log1"]
    mock_row.total_time = 23.5
    mock_row.scanner_signals = {"composite": 0.7}
    mock_row.created_at = datetime(2026, 4, 6, 12, 0, 0, tzinfo=UTC)
    mock_get.return_value = mock_row

    resp = await client.get("/cached/SPY")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert data["narrative"] == "Test narrative"
    assert "created_at" in data


@patch("app.routes.cached.get_cached_analysis")
async def test_cached_not_found(mock_get, client):
    mock_get.return_value = None
    resp = await client.get("/cached/UNKNOWN")
    assert resp.status_code == 404
```

- [ ] **Step 3: Implement GET /cached endpoint**

```python
# app/routes/cached.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from data.cache_repo import get_cached_analysis

router = APIRouter()


@router.get("/cached/{symbol}")
async def get_cached(symbol: str, session: AsyncSession = Depends(get_session)):
    """Return pre-computed analysis for a ticker, or 404."""
    result = await get_cached_analysis(session, symbol.upper())
    if result is None:
        raise HTTPException(status_code=404, detail="No cached analysis")
    return {
        "symbol": result.symbol,
        "scanner_signals": result.scanner_signals,
        "narrative": result.narrative,
        "trade_recs": result.trade_recs,
        "vol_surface": result.vol_surface,
        "phases_log": result.phases_log,
        "total_time": result.total_time,
        "created_at": result.created_at.isoformat(),
    }
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_routes/test_cached.py -v`
Expected: 2 passed

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest -x -q`
Expected: All pass

- [ ] **Step 6: Format and commit**

```bash
uv run ruff format app/routes/cached.py app/dependencies.py app/main.py tests/test_routes/test_cached.py
git add app/routes/cached.py app/dependencies.py app/main.py tests/test_routes/test_cached.py
git commit -m "feat: add GET /cached/{symbol} endpoint with session dependency"
```

---

## Task 6: Write-through from Orchestrator + Scheduler

**Repo:** quant-agent-backend
**Files:**
- Modify: `app/routes/analysis.py`
- Create: `app/scheduler.py`
- Modify: `app/main.py`

- [ ] **Step 1: Add write-through to `_run_orchestrator`**

In `app/routes/analysis.py`, add imports at top:

```python
from data.cache_repo import upsert_cached_analysis
from db.session import create_session_factory
from app.config import Settings
```

Update `_run_orchestrator` signature to accept `session_factory`:

```python
async def _run_orchestrator(
    bus: SSEBus,
    state: OrchestratorState,
    session_factory=None,
) -> None:
```

After the `DoneEvent` emit (inside the `try` block, after `await emit(DoneEvent(...))`), add:

```python
        # Write-through to cache
        if session_factory is not None:
            try:
                async with session_factory() as session:
                    await upsert_cached_analysis(
                        session=session,
                        symbol=state["symbol"],
                        scanner_signals=state["scanner_signals"].model_dump()
                        if hasattr(state["scanner_signals"], "model_dump")
                        else state["scanner_signals"],
                        narrative=result.get("trader_narrative", ""),
                        trade_recs=[
                            r.model_dump() if hasattr(r, "model_dump") else r
                            for r in result.get("trader_trade_recs", [])
                        ],
                        vol_surface=None,  # extracted from phase events if needed
                        phases_log=result.get("logs", []),
                        total_time=elapsed,
                    )
            except Exception as cache_exc:
                logger.warning("orchestrator.cache_write_failed", error=str(cache_exc))
```

Update the `analyze` endpoint to pass session_factory:

```python
    session_factory = getattr(http_request.app.state, "session_factory", None)
    background_tasks.add_task(_run_orchestrator, bus, state, session_factory)
```

- [ ] **Step 2: Create scheduler.py**

```python
# app/scheduler.py
import asyncio

import structlog
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from app.scanner.engine import run_scan
from data.cache_repo import delete_stale_analyses, upsert_cached_analysis
from graphs.orchestrator.graph import build_orchestrator_graph
from graphs.orchestrator.state import OrchestratorState
from models.events import DoneEvent, ErrorEvent, LogEvent, PhaseEvent
from sse.bus import emit, set_bus_context

logger = structlog.get_logger()

REFRESH_INTERVAL = 300  # 5 minutes


async def _run_for_ticker(
    app: FastAPI,
    symbol: str,
    signals,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Run orchestrator for one ticker and cache the result."""
    import time
    from uuid import uuid4

    job_id = f"cache-{uuid4().hex[:8]}"
    bus = app.state.sse_bus
    set_bus_context(bus, job_id)

    state: OrchestratorState = {
        "symbol": symbol,
        "scanner_signals": signals,
        "auto_run": True,
        "freshness": None,
        "discovery_needed": False,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": job_id,
        "logs": [],
    }

    t0 = time.monotonic()
    try:
        graph = build_orchestrator_graph()
        result = state
        async for chunk in graph.astream(state):
            for _node_name, node_output in chunk.items():
                result = {**result, **node_output}

        elapsed = time.monotonic() - t0

        async with session_factory() as session:
            await upsert_cached_analysis(
                session=session,
                symbol=symbol,
                scanner_signals=signals.model_dump() if hasattr(signals, "model_dump") else signals,
                narrative=result.get("trader_narrative", ""),
                trade_recs=[
                    r.model_dump() if hasattr(r, "model_dump") else r
                    for r in result.get("trader_trade_recs", [])
                ],
                vol_surface=None,
                phases_log=result.get("logs", []),
                total_time=elapsed,
            )

        logger.info("scheduler.ticker_complete", symbol=symbol, elapsed=f"{elapsed:.1f}s")

    except Exception as exc:
        logger.error("scheduler.ticker_failed", symbol=symbol, error=str(exc))


async def analysis_refresh_loop(app: FastAPI) -> None:
    """Background loop: scan tickers, run analysis, cache results."""
    session_factory = app.state.session_factory

    # Wait 10s after startup before first run
    await asyncio.sleep(10)

    while True:
        try:
            logger.info("scheduler.refresh_start")
            tickers = await run_scan()
            logger.info("scheduler.scan_complete", count=len(tickers))

            for symbol, signals in tickers[:10]:  # cap at 10 tickers
                await _run_for_ticker(app, symbol, signals, session_factory)

            # Clean up old entries
            async with session_factory() as session:
                await delete_stale_analyses(session, max_age_seconds=3600)

            logger.info("scheduler.refresh_done", tickers=len(tickers))

        except Exception as exc:
            logger.error("scheduler.refresh_failed", error=str(exc))

        await asyncio.sleep(REFRESH_INTERVAL)
```

- [ ] **Step 3: Start scheduler in lifespan**

In `app/main.py`, add import:

```python
from app.scheduler import analysis_refresh_loop
```

In the `lifespan()` function, after `app.state.session_factory = ...` and before `yield`, add:

```python
    # Start background refresh scheduler
    refresh_task = asyncio.create_task(analysis_refresh_loop(app))
```

After `yield`, add cleanup:

```python
    refresh_task.cancel()
```

The full lifespan should look like:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    if not hasattr(app.state, "sse_bus"):
        app.state.sse_bus = InMemorySSEBus()

    settings = Settings()
    engine = create_async_engine(settings.effective_database_url)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    await engine.dispose()

    app.state.session_factory = create_session_factory(settings.effective_database_url)

    refresh_task = asyncio.create_task(analysis_refresh_loop(app))

    yield

    refresh_task.cancel()
```

- [ ] **Step 4: Run full test suite**

Run: `uv run pytest -x -q`
Expected: All pass (scheduler doesn't run in tests — lifespan not invoked by test client)

- [ ] **Step 5: Format and commit**

```bash
uv run ruff format app/scheduler.py app/routes/analysis.py app/main.py
git add app/scheduler.py app/routes/analysis.py app/main.py
git commit -m "feat: add background scheduler and write-through cache from orchestrator"
```

---

## Task 7: Frontend — Cached Route + Hook Integration

**Repo:** quant-agent-service (`/Users/ianrahwan/Documents/Projects/quant-agent-service`)
**Files:**
- Create: `src/app/api/agent/cached/[symbol]/route.ts`
- Modify: `src/lib/agent-types.ts`
- Modify: `src/hooks/useAgentAnalysis.ts`

- [ ] **Step 1: Add CachedAnalysis type**

In `src/lib/agent-types.ts`, add after the `PollResponse` interface:

```typescript
export interface CachedAnalysis {
  symbol: string;
  scanner_signals: ScannerSignals;
  narrative: string;
  trade_recs: TradeRecommendation[];
  vol_surface: Record<string, unknown> | null;
  phases_log: string[];
  total_time: number;
  created_at: string;
}
```

Add `cachedAt: string | null;` to the `AgentAnalysisState` interface:

```typescript
export interface AgentAnalysisState {
  status: "idle" | "running" | "checkpoint" | "complete" | "error";
  jobId: string | null;
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
  volSurface: Record<string, unknown> | null;
  narrativeTokens: string;
  tradeRecs: TradeRecommendation[];
  checkpointMessage: string | null;
  error: string | null;
  totalTime: number | null;
  logs: string[];
  cachedAt: string | null;
}
```

- [ ] **Step 2: Create cached proxy route**

Create directory and file:

```typescript
// src/app/api/agent/cached/[symbol]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  const resp = await fetch(`${BACKEND_URL}/cached/${symbol}`, {
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    return NextResponse.json(null, { status: resp.status });
  }

  const data = await resp.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Update useAgentAnalysis hook to fetch cached on mount**

In `src/hooks/useAgentAnalysis.ts`:

Update `initialState()` to include `cachedAt`:

```typescript
function initialState(): AgentAnalysisState {
  return {
    status: "idle",
    jobId: null,
    phases: new Map(INITIAL_PHASES),
    volSurface: null,
    narrativeTokens: "",
    tradeRecs: [],
    checkpointMessage: null,
    error: null,
    totalTime: null,
    logs: [],
    cachedAt: null,
  };
}
```

Add import for `CachedAnalysis` and `useEffect`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
// ... add CachedAnalysis to the type imports
```

Add a `loadCached` function and `useEffect` inside the hook, before `startAnalysis`:

```typescript
  const loadCached = useCallback(async (symbol: string) => {
    try {
      const resp = await fetch(`/api/agent/cached/${symbol}`);
      if (!resp.ok) return;
      const data: CachedAnalysis = await resp.json();

      const phases = new Map(INITIAL_PHASES) as Map<AgentPhase, "pending" | "in_progress" | "complete">;
      for (const key of phases.keys()) {
        phases.set(key, "complete");
      }

      setState({
        status: "complete",
        jobId: null,
        phases,
        volSurface: data.vol_surface,
        narrativeTokens: data.narrative,
        tradeRecs: data.trade_recs,
        checkpointMessage: null,
        error: null,
        totalTime: data.total_time,
        logs: data.phases_log,
        cachedAt: data.created_at,
      });
    } catch {
      // No cache available — stay idle
    }
  }, []);
```

Update the return to include `loadCached`:

```typescript
  return {
    state,
    bearState,
    startAnalysis,
    resumeCheckpoint,
    reset,
    loadCached,
  };
```

- [ ] **Step 4: Call loadCached from the ticker page**

In `src/app/ticker/[symbol]/page.tsx` (or wherever `useAgentAnalysis` is consumed), add a `useEffect` to call `loadCached` on mount:

```typescript
const { state, bearState, startAnalysis, resumeCheckpoint, reset, loadCached } = useAgentAnalysis();

useEffect(() => {
  loadCached(symbol);
}, [symbol, loadCached]);
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no type errors

- [ ] **Step 6: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/app/api/agent/cached/ src/lib/agent-types.ts src/hooks/useAgentAnalysis.ts src/app/ticker/
git commit -m "feat: fetch cached analysis on page load for instant results"
```

---

## Task 8: Frontend — Cache Indicator in UI

**Repo:** quant-agent-service
**Files:**
- Modify: `src/components/detail/AgentPanel.tsx`

- [ ] **Step 1: Read current AgentPanel.tsx**

Read the file to understand the current layout before modifying.

- [ ] **Step 2: Add cache indicator and relabel button**

In `AgentPanel.tsx`, add a helper function for relative time:

```typescript
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
```

Where the completion banner is shown (look for the `status === "complete"` section), add the cache indicator:

```typescript
{state.cachedAt && (
  <span className="text-xs text-bb-muted font-mono ml-2">
    cached {timeAgo(state.cachedAt)}
  </span>
)}
```

Where the RUN ANALYSIS button is rendered, relabel when viewing cached data:

```typescript
{state.cachedAt ? "REFRESH ANALYSIS" : "RUN ANALYSIS"}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/AgentPanel.tsx
git commit -m "feat: show cache age indicator and relabel button for cached results"
```

---

## Task 9: Push Both Repos

- [ ] **Step 1: Push backend**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
uv run ruff format --check .
uv run pytest -x -q
git push
```

- [ ] **Step 2: Push frontend**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
npm run build
git push origin main
```

- [ ] **Step 3: Run Alembic migration on ECS**

After ECS deploys the new backend, run the migration against the production database:

```bash
alembic upgrade head
```

This can be done via ECS exec or a one-off task.

- [ ] **Step 4: Verify end-to-end**

1. Wait for ECS to stabilize
2. Check backend health: `curl http://quant-agent-alb-*.elb.amazonaws.com/health`
3. Wait ~5 min for first scheduler cycle
4. Test cached endpoint: `curl http://quant-agent-alb-*.elb.amazonaws.com/cached/SPY`
5. Open production frontend, navigate to a scanner ticker — should load instantly
