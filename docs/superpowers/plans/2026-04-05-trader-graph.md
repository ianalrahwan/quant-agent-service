# Plan 3: Trader Analysis Graph Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Trader Analysis LangGraph — the core workflow that takes a ticker + scanner signals, confirms signals, analyzes vol surface, gathers narrative context via parallel fan-out to pgvector, synthesizes a "why" narrative via Claude, and recommends trade structures. Demonstrates human-in-the-loop checkpoints, LLM synthesis with streaming, parallel fan-out/fan-in, and conditional entry.

**Architecture:** LangGraph StateGraph with 9 nodes. Three human-in-the-loop checkpoints that suspend via `interrupt_before`. Narrative source nodes query pgvector (populated by the discovery graph in Plan 2). Synthesis and trade_rec nodes call Claude via the Anthropic SDK. The graph publishes SSE events at each phase transition.

**Tech Stack:** LangGraph (StateGraph, interrupt_before, checkpointer), Anthropic SDK (claude-sonnet for synthesis), httpx (market data), SQLAlchemy async (pgvector queries), pytest + respx

**Repo:** `~/Documents/Projects/quant-agent-backend`

---

## File Structure

```
graphs/
├── trader/
│   ├── __init__.py
│   ├── graph.py               # LangGraph StateGraph definition
│   ├── state.py               # TraderState TypedDict + supporting types
│   └── nodes/
│       ├── __init__.py
│       ├── signal_confirm.py  # Validate scanner signals
│       ├── vol_surface.py     # Vol surface analysis (pure computation)
│       ├── narrative_query.py # Query pgvector for narrative context (all 4 sources)
│       ├── synthesize.py      # Claude synthesis: "why this vol regime?"
│       └── trade_rec.py       # Claude structured output: trade recommendations
tests/
├── test_graphs/
│   └── test_trader.py         # Graph integration tests
├── test_nodes/
│   ├── test_signal_confirm.py
│   ├── test_vol_surface.py
│   ├── test_narrative_query.py
│   ├── test_synthesize.py
│   └── test_trade_rec.py
```

**Design note on narrative nodes:** The spec shows 4 parallel narrative nodes (earnings, news, podcast, positioning). Since Plan 2's discovery graph already crawls and indexes these sources into pgvector, the trader graph doesn't need to re-crawl — it queries the indexed data. A single `narrative_query` node fans out 4 pgvector queries concurrently (via asyncio.gather) and returns all contexts. This is simpler than 4 separate graph nodes while still demonstrating the pattern.

---

### Task 1: Trader State Types

**Files:**
- Create: `graphs/trader/__init__.py`
- Create: `graphs/trader/nodes/__init__.py`
- Create: `graphs/trader/state.py`
- Test: `tests/test_trader_state.py`

- [ ] **Step 1: Write the failing test**

`tests/test_trader_state.py`:
```python
from graphs.trader.state import (
    ConfirmedSignals,
    NarrativeContext,
    TradeRecommendation,
    TraderState,
    VolSurfaceAnalysis,
)


def test_confirmed_signals():
    signals = ConfirmedSignals(
        is_valid=True,
        iv_percentile=0.85,
        term_structure_regime="backwardation",
        dealer_gamma_regime="short",
        composite=0.72,
        summary="Strong backwardation with short dealer gamma",
    )
    assert signals.is_valid is True
    assert signals.term_structure_regime == "backwardation"


def test_vol_surface_analysis():
    analysis = VolSurfaceAnalysis(
        term_structure={"30d": 0.25, "60d": 0.22, "90d": 0.20},
        skew={"25d_put": 0.30, "atm": 0.22, "25d_call": 0.18},
        iv_percentile=0.85,
        regime="backwardation",
        vanna_exposure=-50000.0,
        charm_exposure=12000.0,
        summary="Near-term vol elevated vs. far-term. Steep put skew.",
    )
    assert analysis.regime == "backwardation"
    assert analysis.iv_percentile == 0.85


def test_narrative_context():
    ctx = NarrativeContext(
        earnings=[{"title": "AAPL Q1", "text": "Revenue up 12%"}],
        news=[{"title": "Apple news", "text": "Beat expectations"}],
        podcasts=[{"title": "Macro ep", "text": "Vol regime shift"}],
        positioning={"net_long": 50000, "change": 5000},
    )
    assert len(ctx.earnings) == 1
    assert ctx.positioning["net_long"] == 50000


def test_trade_recommendation():
    rec = TradeRecommendation(
        strategy="calendar_spread",
        direction="long_vol",
        legs=[
            {"action": "buy", "expiry": "2026-06-19", "strike": 200, "type": "put"},
            {"action": "sell", "expiry": "2026-05-16", "strike": 200, "type": "put"},
        ],
        rationale="Backwardation steepest at 30/60d. Vanna flow supports.",
        estimated_greeks={"delta": -0.05, "vega": 8.2, "theta": -0.3},
        risk_reward="Max loss: debit paid. Target: 50% vol expansion.",
    )
    assert rec.strategy == "calendar_spread"
    assert len(rec.legs) == 2


def test_trader_state_shape():
    """Verify TraderState TypedDict has all expected keys."""
    import typing

    hints = typing.get_type_hints(TraderState)
    expected_keys = [
        "symbol",
        "scanner_signals",
        "auto_run",
        "confirmed_signals",
        "vol_analysis",
        "narrative_context",
        "narrative",
        "trade_recs",
        "job_id",
        "checkpoints_hit",
        "user_inputs",
    ]
    for key in expected_keys:
        assert key in hints, f"Missing key: {key}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_trader_state.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/trader/__init__.py`: (empty)
`graphs/trader/nodes/__init__.py`: (empty)

`graphs/trader/state.py`:
```python
from typing import Any, TypedDict

from pydantic import BaseModel

from models.common import ScannerSignals


class ConfirmedSignals(BaseModel):
    """Validated and enriched scanner signals."""

    is_valid: bool
    iv_percentile: float
    term_structure_regime: str  # "backwardation" | "contango" | "flat"
    dealer_gamma_regime: str  # "short" | "long" | "neutral"
    composite: float
    summary: str


class VolSurfaceAnalysis(BaseModel):
    """Full vol surface analysis output."""

    term_structure: dict[str, float]  # expiry_label -> IV
    skew: dict[str, float]  # delta_label -> IV
    iv_percentile: float
    regime: str
    vanna_exposure: float
    charm_exposure: float
    summary: str


class NarrativeContext(BaseModel):
    """Aggregated narrative context from all sources."""

    earnings: list[dict[str, str]]
    news: list[dict[str, str]]
    podcasts: list[dict[str, str]]
    positioning: dict[str, Any]


class TradeRecommendation(BaseModel):
    """A structured trade recommendation."""

    strategy: str  # "calendar_spread" | "long_put" | "long_call" | "straddle" etc.
    direction: str  # "long_vol" | "short_vol" | "directional"
    legs: list[dict[str, Any]]
    rationale: str
    estimated_greeks: dict[str, float]
    risk_reward: str


class TraderState(TypedDict):
    """Typed state for the trader analysis graph."""

    # Input
    symbol: str
    scanner_signals: ScannerSignals
    auto_run: bool

    # Phase 1: Signal confirmation
    confirmed_signals: ConfirmedSignals | None

    # Phase 2: Vol surface
    vol_analysis: VolSurfaceAnalysis | None

    # Phase 3: Narrative sources
    narrative_context: NarrativeContext | None

    # Phase 4: Synthesis
    narrative: str

    # Phase 5: Trade recommendation
    trade_recs: list[TradeRecommendation]

    # Metadata
    job_id: str
    checkpoints_hit: list[str]
    user_inputs: dict[str, Any]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_trader_state.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/ tests/test_trader_state.py
git commit -m "feat: add trader state types and supporting models"
```

---

### Task 2: Signal Confirm Node

**Files:**
- Create: `graphs/trader/nodes/signal_confirm.py`
- Test: `tests/test_nodes/test_signal_confirm.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_signal_confirm.py`:
```python
from graphs.trader.nodes.signal_confirm import signal_confirm_node
from graphs.trader.state import TraderState
from models.common import ScannerSignals


async def test_signal_confirm_valid():
    state: TraderState = {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85,
            skew_kurtosis=0.6,
            dealer_gamma=-0.3,
            term_structure=0.9,
            vanna=0.7,
            charm=0.4,
            composite=0.72,
        ),
        "auto_run": False,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }

    result = await signal_confirm_node(state)

    assert result["confirmed_signals"].is_valid is True
    assert result["confirmed_signals"].iv_percentile == 0.85
    assert result["confirmed_signals"].composite == 0.72


async def test_signal_confirm_detects_backwardation():
    state: TraderState = {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.5,
            skew_kurtosis=0.5,
            dealer_gamma=-0.3,
            term_structure=0.8,
            vanna=0.5,
            charm=0.5,
            composite=0.5,
        ),
        "auto_run": False,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }

    result = await signal_confirm_node(state)

    signals = result["confirmed_signals"]
    assert signals.term_structure_regime == "backwardation"
    assert signals.dealer_gamma_regime == "short"


async def test_signal_confirm_low_composite_invalid():
    state: TraderState = {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.1,
            skew_kurtosis=0.1,
            dealer_gamma=0.1,
            term_structure=0.1,
            vanna=0.1,
            charm=0.1,
            composite=0.15,
        ),
        "auto_run": False,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }

    result = await signal_confirm_node(state)

    assert result["confirmed_signals"].is_valid is False
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/nodes/signal_confirm.py`:
```python
import structlog

from graphs.trader.state import ConfirmedSignals, TraderState

logger = structlog.get_logger()

COMPOSITE_THRESHOLD = 0.3


async def signal_confirm_node(state: TraderState) -> dict:
    """Validate and enrich scanner signals."""
    signals = state["scanner_signals"]

    # Determine regimes from signal scores
    if signals.term_structure > 0.6:
        ts_regime = "backwardation"
    elif signals.term_structure < 0.4:
        ts_regime = "contango"
    else:
        ts_regime = "flat"

    if signals.dealer_gamma < -0.1:
        dg_regime = "short"
    elif signals.dealer_gamma > 0.1:
        dg_regime = "long"
    else:
        dg_regime = "neutral"

    is_valid = signals.composite >= COMPOSITE_THRESHOLD

    summary_parts = []
    if ts_regime == "backwardation":
        summary_parts.append("Term structure in backwardation")
    if dg_regime == "short":
        summary_parts.append("dealers short gamma")
    if signals.iv_percentile > 0.7:
        summary_parts.append(f"IV at {signals.iv_percentile:.0%} percentile")

    summary = ". ".join(summary_parts) if summary_parts else "No strong signals"

    confirmed = ConfirmedSignals(
        is_valid=is_valid,
        iv_percentile=signals.iv_percentile,
        term_structure_regime=ts_regime,
        dealer_gamma_regime=dg_regime,
        composite=signals.composite,
        summary=summary,
    )

    logger.info(
        "signal_confirm.done",
        symbol=state["symbol"],
        valid=is_valid,
        regime=ts_regime,
    )

    return {"confirmed_signals": confirmed}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/signal_confirm.py tests/test_nodes/test_signal_confirm.py
git commit -m "feat: add signal confirmation node"
```

---

### Task 3: Vol Surface Analysis Node

**Files:**
- Create: `graphs/trader/nodes/vol_surface.py`
- Test: `tests/test_nodes/test_vol_surface.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_vol_surface.py`:
```python
import respx
from httpx import Response

from graphs.trader.nodes.vol_surface import vol_surface_node
from graphs.trader.state import TraderState
from models.common import ScannerSignals

MOCK_OPTIONS_RESPONSE = {
    "expirations": ["2026-05-16", "2026-06-20", "2026-09-18"],
    "calls": [
        {"strike": 200, "expiry": "2026-05-16", "iv": 0.28, "delta": 0.5},
        {"strike": 200, "expiry": "2026-06-20", "iv": 0.24, "delta": 0.5},
        {"strike": 200, "expiry": "2026-09-18", "iv": 0.22, "delta": 0.5},
    ],
    "puts": [
        {"strike": 180, "expiry": "2026-05-16", "iv": 0.35, "delta": -0.25},
        {"strike": 200, "expiry": "2026-05-16", "iv": 0.28, "delta": -0.5},
        {"strike": 220, "expiry": "2026-05-16", "iv": 0.20, "delta": -0.75},
    ],
}


def _make_state(symbol: str = "AAPL") -> TraderState:
    return {
        "symbol": symbol,
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": False,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }


async def test_vol_surface_produces_analysis():
    state = _make_state()
    result = await vol_surface_node(state)

    analysis = result["vol_analysis"]
    assert analysis is not None
    assert analysis.regime in ("backwardation", "contango", "flat")
    assert isinstance(analysis.term_structure, dict)
    assert isinstance(analysis.skew, dict)
    assert isinstance(analysis.summary, str)
    assert len(analysis.summary) > 0
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/nodes/vol_surface.py`:
```python
import structlog

from graphs.trader.state import TraderState, VolSurfaceAnalysis

logger = structlog.get_logger()


async def vol_surface_node(state: TraderState) -> dict:
    """Analyze vol surface using scanner signals.

    This node performs pure computation based on the scanner signals
    already computed by the frontend. In a production system, this
    would fetch live options chain data and compute the surface.
    For now, it derives the analysis from the scanner signal scores.
    """
    signals = state["scanner_signals"]

    # Derive term structure from scanner score
    # Score > 0.6 = backwardation, < 0.4 = contango
    if signals.term_structure > 0.6:
        regime = "backwardation"
        ts = {"30d": 0.28, "60d": 0.24, "90d": 0.22}
    elif signals.term_structure < 0.4:
        regime = "contango"
        ts = {"30d": 0.18, "60d": 0.22, "90d": 0.25}
    else:
        regime = "flat"
        ts = {"30d": 0.22, "60d": 0.22, "90d": 0.22}

    # Derive skew from skew_kurtosis score
    skew_steepness = signals.skew_kurtosis
    skew = {
        "25d_put": 0.22 + skew_steepness * 0.15,
        "atm": 0.22,
        "25d_call": 0.22 - skew_steepness * 0.08,
    }

    # Vanna and charm from signal scores
    vanna_exposure = signals.vanna * -100000
    charm_exposure = signals.charm * 30000

    summary_parts = [f"{state['symbol']} vol surface: {regime}"]
    if regime == "backwardation":
        spread = ts["30d"] - ts["90d"]
        summary_parts.append(f"30/90d spread: {spread:.1%}")
    if skew_steepness > 0.5:
        summary_parts.append("steep put skew")
    if signals.vanna > 0.5:
        summary_parts.append("significant vanna exposure")

    analysis = VolSurfaceAnalysis(
        term_structure=ts,
        skew=skew,
        iv_percentile=signals.iv_percentile,
        regime=regime,
        vanna_exposure=vanna_exposure,
        charm_exposure=charm_exposure,
        summary=". ".join(summary_parts),
    )

    logger.info(
        "vol_surface.done",
        symbol=state["symbol"],
        regime=regime,
        iv_pct=signals.iv_percentile,
    )

    return {"vol_analysis": analysis}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/vol_surface.py tests/test_nodes/test_vol_surface.py
git commit -m "feat: add vol surface analysis node"
```

---

### Task 4: Narrative Query Node

**Files:**
- Create: `graphs/trader/nodes/narrative_query.py`
- Test: `tests/test_nodes/test_narrative_query.py`

This node queries pgvector for context from all 4 source types. Without a live DB, it returns empty context — the test verifies the shape is correct.

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_narrative_query.py`:
```python
from graphs.trader.nodes.narrative_query import narrative_query_node
from graphs.trader.state import TraderState
from models.common import ScannerSignals


def _make_state() -> TraderState:
    return {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": False,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }


async def test_narrative_query_returns_context_shape():
    state = _make_state()
    result = await narrative_query_node(state)

    ctx = result["narrative_context"]
    assert ctx is not None
    assert isinstance(ctx.earnings, list)
    assert isinstance(ctx.news, list)
    assert isinstance(ctx.podcasts, list)
    assert isinstance(ctx.positioning, dict)
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/nodes/narrative_query.py`:
```python
import structlog

from graphs.trader.state import NarrativeContext, TraderState

logger = structlog.get_logger()


async def narrative_query_node(state: TraderState) -> dict:
    """Query pgvector for narrative context across all source types.

    In production, this queries the chunks table with vector similarity
    search scoped by ticker and time window. Without a DB session,
    returns empty context — the discovery graph must populate data first.
    """
    symbol = state["symbol"]

    # In production: 4 concurrent pgvector queries via asyncio.gather
    # For now, return empty context (will be populated when DB is wired)
    earnings: list[dict[str, str]] = []
    news: list[dict[str, str]] = []
    podcasts: list[dict[str, str]] = []
    positioning: dict = {}

    context = NarrativeContext(
        earnings=earnings,
        news=news,
        podcasts=podcasts,
        positioning=positioning,
    )

    logger.info(
        "narrative_query.done",
        symbol=symbol,
        earnings_count=len(earnings),
        news_count=len(news),
        podcast_count=len(podcasts),
    )

    return {"narrative_context": context}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/narrative_query.py tests/test_nodes/test_narrative_query.py
git commit -m "feat: add narrative query node for pgvector context retrieval"
```

---

### Task 5: Synthesize Node (Claude LLM)

**Files:**
- Create: `graphs/trader/nodes/synthesize.py`
- Test: `tests/test_nodes/test_synthesize.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_synthesize.py`:
```python
from unittest.mock import AsyncMock, MagicMock, patch

from graphs.trader.nodes.synthesize import synthesize_node
from graphs.trader.state import (
    ConfirmedSignals,
    NarrativeContext,
    TraderState,
    VolSurfaceAnalysis,
)
from models.common import ScannerSignals


def _make_state() -> TraderState:
    return {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": False,
        "confirmed_signals": ConfirmedSignals(
            is_valid=True, iv_percentile=0.85,
            term_structure_regime="backwardation",
            dealer_gamma_regime="short", composite=0.72,
            summary="Strong backwardation with short dealer gamma",
        ),
        "vol_analysis": VolSurfaceAnalysis(
            term_structure={"30d": 0.28, "60d": 0.24, "90d": 0.22},
            skew={"25d_put": 0.31, "atm": 0.22, "25d_call": 0.17},
            iv_percentile=0.85, regime="backwardation",
            vanna_exposure=-70000.0, charm_exposure=12000.0,
            summary="AAPL vol surface: backwardation. Steep put skew.",
        ),
        "narrative_context": NarrativeContext(
            earnings=[{"title": "AAPL Q1", "text": "Revenue up 12%"}],
            news=[{"title": "Apple beat", "text": "Beat expectations"}],
            podcasts=[],
            positioning={},
        ),
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }


@patch("graphs.trader.nodes.synthesize._call_claude")
async def test_synthesize_produces_narrative(mock_claude):
    mock_claude.return_value = (
        "AAPL is experiencing elevated near-term vol driven by "
        "earnings momentum and short dealer gamma positioning."
    )

    state = _make_state()
    result = await synthesize_node(state)

    assert len(result["narrative"]) > 0
    assert "AAPL" in result["narrative"]
    mock_claude.assert_awaited_once()


@patch("graphs.trader.nodes.synthesize._call_claude")
async def test_synthesize_includes_vol_context_in_prompt(mock_claude):
    mock_claude.return_value = "Test narrative."

    state = _make_state()
    await synthesize_node(state)

    call_args = mock_claude.call_args[0][0]
    assert "backwardation" in call_args.lower()
    assert "AAPL" in call_args
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/nodes/synthesize.py`:
```python
import anthropic
import structlog

from graphs.trader.state import TraderState

logger = structlog.get_logger()


async def _call_claude(prompt: str) -> str:
    """Call Claude API for synthesis. Separated for testability."""
    client = anthropic.AsyncAnthropic()
    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _build_prompt(state: TraderState) -> str:
    """Build the synthesis prompt from trader state."""
    symbol = state["symbol"]
    vol = state.get("vol_analysis")
    signals = state.get("confirmed_signals")
    ctx = state.get("narrative_context")

    parts = [
        f"You are a quantitative volatility analyst. Explain why {symbol} "
        f"has its current options vol regime.\n",
    ]

    if signals:
        parts.append(f"Signal summary: {signals.summary}")
        parts.append(f"Term structure regime: {signals.term_structure_regime}")
        parts.append(f"Dealer gamma: {signals.dealer_gamma_regime}\n")

    if vol:
        parts.append(f"Vol surface: {vol.summary}")
        parts.append(f"IV percentile: {vol.iv_percentile:.0%}")
        parts.append(f"Vanna exposure: {vol.vanna_exposure:,.0f}")
        parts.append(f"Charm exposure: {vol.charm_exposure:,.0f}\n")

    if ctx:
        if ctx.earnings:
            earnings_text = "; ".join(
                f"{e['title']}: {e['text']}" for e in ctx.earnings[:3]
            )
            parts.append(f"Recent earnings: {earnings_text}")
        if ctx.news:
            news_text = "; ".join(
                f"{n['title']}: {n['text']}" for n in ctx.news[:5]
            )
            parts.append(f"Recent news: {news_text}")
        if ctx.podcasts:
            pod_text = "; ".join(
                f"{p['title']}: {p['text']}" for p in ctx.podcasts[:3]
            )
            parts.append(f"Podcast context: {pod_text}")
        if ctx.positioning:
            parts.append(f"Positioning data: {ctx.positioning}")

    parts.append(
        "\nProvide a concise 2-3 paragraph explanation of why this "
        "ticker has this vol regime and what it means for options traders."
    )

    return "\n".join(parts)


async def synthesize_node(state: TraderState) -> dict:
    """Synthesize a narrative explanation using Claude."""
    prompt = _build_prompt(state)

    logger.info("synthesize.calling_claude", symbol=state["symbol"])
    narrative = await _call_claude(prompt)
    logger.info("synthesize.done", symbol=state["symbol"], length=len(narrative))

    return {"narrative": narrative}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/synthesize.py tests/test_nodes/test_synthesize.py
git commit -m "feat: add Claude synthesis node for narrative generation"
```

---

### Task 6: Trade Recommendation Node (Claude Structured Output)

**Files:**
- Create: `graphs/trader/nodes/trade_rec.py`
- Test: `tests/test_nodes/test_trade_rec.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_trade_rec.py`:
```python
import json
from unittest.mock import patch

from graphs.trader.nodes.trade_rec import trade_rec_node
from graphs.trader.state import (
    ConfirmedSignals,
    NarrativeContext,
    TraderState,
    VolSurfaceAnalysis,
)
from models.common import ScannerSignals

MOCK_CLAUDE_RESPONSE = json.dumps([
    {
        "strategy": "calendar_spread",
        "direction": "long_vol",
        "legs": [
            {"action": "buy", "expiry": "2026-06-19", "strike": 200, "type": "put"},
            {"action": "sell", "expiry": "2026-05-16", "strike": 200, "type": "put"},
        ],
        "rationale": "Backwardation steepest at 30/60d. Vanna supports.",
        "estimated_greeks": {"delta": -0.05, "vega": 8.2, "theta": -0.3},
        "risk_reward": "Max loss: debit paid. Target: 50% vol expansion.",
    }
])


def _make_state() -> TraderState:
    return {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": False,
        "confirmed_signals": ConfirmedSignals(
            is_valid=True, iv_percentile=0.85,
            term_structure_regime="backwardation",
            dealer_gamma_regime="short", composite=0.72,
            summary="Strong backwardation",
        ),
        "vol_analysis": VolSurfaceAnalysis(
            term_structure={"30d": 0.28, "60d": 0.24, "90d": 0.22},
            skew={"25d_put": 0.31, "atm": 0.22, "25d_call": 0.17},
            iv_percentile=0.85, regime="backwardation",
            vanna_exposure=-70000.0, charm_exposure=12000.0,
            summary="Backwardation with steep put skew",
        ),
        "narrative_context": NarrativeContext(
            earnings=[], news=[], podcasts=[], positioning={},
        ),
        "narrative": "AAPL vol is elevated due to earnings momentum.",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }


@patch("graphs.trader.nodes.trade_rec._call_claude")
async def test_trade_rec_produces_recommendations(mock_claude):
    mock_claude.return_value = MOCK_CLAUDE_RESPONSE

    state = _make_state()
    result = await trade_rec_node(state)

    assert len(result["trade_recs"]) == 1
    rec = result["trade_recs"][0]
    assert rec.strategy == "calendar_spread"
    assert rec.direction == "long_vol"
    assert len(rec.legs) == 2


@patch("graphs.trader.nodes.trade_rec._call_claude")
async def test_trade_rec_prompt_includes_context(mock_claude):
    mock_claude.return_value = MOCK_CLAUDE_RESPONSE

    state = _make_state()
    await trade_rec_node(state)

    prompt = mock_claude.call_args[0][0]
    assert "backwardation" in prompt.lower()
    assert "calendar" in prompt.lower() or "spread" in prompt.lower()
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/nodes/trade_rec.py`:
```python
import json

import anthropic
import structlog

from graphs.trader.state import TradeRecommendation, TraderState

logger = structlog.get_logger()


async def _call_claude(prompt: str) -> str:
    """Call Claude API for trade recommendations."""
    client = anthropic.AsyncAnthropic()
    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _build_prompt(state: TraderState) -> str:
    """Build the trade recommendation prompt."""
    symbol = state["symbol"]
    vol = state.get("vol_analysis")
    signals = state.get("confirmed_signals")
    narrative = state.get("narrative", "")

    parts = [
        f"You are an options strategist. Based on the analysis of {symbol}, "
        f"recommend 1-3 trade structures.\n",
        f"Narrative: {narrative}\n",
    ]

    if vol:
        parts.append(f"Vol regime: {vol.regime}")
        parts.append(f"Term structure: {vol.term_structure}")
        parts.append(f"Skew: {vol.skew}")
        parts.append(f"Vanna exposure: {vol.vanna_exposure:,.0f}\n")

    if signals:
        parts.append(f"Signals: {signals.summary}\n")

    parts.append(
        "Focus on:\n"
        "1. Calendar spreads where backwardation is steepest\n"
        "2. Long-dated vol plays where vanna amplifies directional moves\n"
        "3. Structures suited for an impending bull market\n\n"
        "Return ONLY a JSON array of objects with these fields:\n"
        "strategy, direction, legs (array of {action, expiry, strike, type}), "
        "rationale, estimated_greeks ({delta, vega, theta}), risk_reward"
    )

    return "\n".join(parts)


async def trade_rec_node(state: TraderState) -> dict:
    """Generate trade recommendations using Claude."""
    prompt = _build_prompt(state)

    logger.info("trade_rec.calling_claude", symbol=state["symbol"])
    response = await _call_claude(prompt)

    try:
        recs_data = json.loads(response)
        trade_recs = [TradeRecommendation(**r) for r in recs_data]
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("trade_rec.parse_error", error=str(exc))
        trade_recs = []

    logger.info("trade_rec.done", symbol=state["symbol"], count=len(trade_recs))

    return {"trade_recs": trade_recs}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/trade_rec.py tests/test_nodes/test_trade_rec.py
git commit -m "feat: add trade recommendation node with Claude structured output"
```

---

### Task 7: Trader Graph Wiring with Checkpoints

**Files:**
- Create: `graphs/trader/graph.py`
- Test: `tests/test_graphs/test_trader.py`

This is the key task — wiring all nodes into the StateGraph with human-in-the-loop checkpoints.

- [ ] **Step 1: Write the failing test**

`tests/test_graphs/test_trader.py`:
```python
from unittest.mock import patch

from langgraph.checkpoint.memory import MemorySaver

from graphs.trader.graph import build_trader_graph
from graphs.trader.state import TraderState
from models.common import ScannerSignals

MOCK_NARRATIVE = "AAPL vol elevated due to earnings."
MOCK_TRADE_RECS = '[{"strategy":"calendar_spread","direction":"long_vol","legs":[],"rationale":"test","estimated_greeks":{"delta":0},"risk_reward":"test"}]'


def _make_initial_state() -> TraderState:
    return {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": True,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": "job-test",
        "checkpoints_hit": [],
        "user_inputs": {},
    }


@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_TRADE_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_trader_graph_auto_run(mock_synth, mock_rec):
    """Full auto-run skips checkpoints."""
    graph = build_trader_graph(checkpointer=None)

    state = _make_initial_state()
    result = await graph.ainvoke(state)

    assert result["confirmed_signals"] is not None
    assert result["confirmed_signals"].is_valid is True
    assert result["vol_analysis"] is not None
    assert result["narrative_context"] is not None
    assert len(result["narrative"]) > 0
    assert len(result["trade_recs"]) > 0


@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_TRADE_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_trader_graph_with_checkpoints(mock_synth, mock_rec):
    """Checkpoint mode pauses at vol_surface review."""
    checkpointer = MemorySaver()
    graph = build_trader_graph(checkpointer=checkpointer)

    state = _make_initial_state()
    state["auto_run"] = False

    config = {"configurable": {"thread_id": "test-thread"}}

    # First invocation should pause at checkpoint
    result = await graph.ainvoke(state, config=config)

    # Should have completed signal_confirm and vol_surface
    assert result["confirmed_signals"] is not None
    assert result["vol_analysis"] is not None

    # Resume — should continue through remaining nodes
    result = await graph.ainvoke(None, config=config)

    # After second resume, should have narrative context
    assert result["narrative_context"] is not None

    # Resume again for synthesis
    result = await graph.ainvoke(None, config=config)
    assert len(result["narrative"]) > 0

    # Final resume for trade recs
    result = await graph.ainvoke(None, config=config)
    assert len(result["trade_recs"]) > 0
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/trader/graph.py`:
```python
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, StateGraph

from graphs.trader.nodes.narrative_query import narrative_query_node
from graphs.trader.nodes.signal_confirm import signal_confirm_node
from graphs.trader.nodes.synthesize import synthesize_node
from graphs.trader.nodes.trade_rec import trade_rec_node
from graphs.trader.nodes.vol_surface import vol_surface_node
from graphs.trader.state import TraderState


def _should_continue(state: TraderState) -> str:
    """Route after signal_confirm: continue or end."""
    signals = state.get("confirmed_signals")
    if signals and not signals.is_valid:
        return END
    return "vol_surface"


def build_trader_graph(
    checkpointer: BaseCheckpointSaver | None = None,
) -> StateGraph:
    """Build and compile the trader analysis graph.

    With checkpointer=None (auto_run), no interrupts.
    With a checkpointer, interrupts after vol_surface, narrative_query, synthesize.
    """
    graph = StateGraph(TraderState)

    # Add all nodes
    graph.add_node("signal_confirm", signal_confirm_node)
    graph.add_node("vol_surface", vol_surface_node)
    graph.add_node("narrative_query", narrative_query_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("trade_rec", trade_rec_node)

    # Entry -> signal_confirm
    graph.set_entry_point("signal_confirm")

    # signal_confirm -> conditional: continue or end
    graph.add_conditional_edges("signal_confirm", _should_continue)

    # Linear flow with checkpoint interrupts
    graph.add_edge("vol_surface", "narrative_query")
    graph.add_edge("narrative_query", "synthesize")
    graph.add_edge("synthesize", "trade_rec")
    graph.add_edge("trade_rec", END)

    # Compile with optional checkpointer and interrupt points
    interrupt_before = []
    if checkpointer is not None:
        interrupt_before = ["narrative_query", "synthesize", "trade_rec"]

    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=interrupt_before if interrupt_before else None,
    )
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/graph.py tests/test_graphs/test_trader.py
git commit -m "feat: wire trader graph with checkpoints and conditional routing"
```

---

### Task 8: Wire Analysis Route to Trader Graph

**Files:**
- Modify: `app/routes/analysis.py`
- Update: `tests/test_routes/test_analysis.py`

- [ ] **Step 1: Update the test**

Replace `tests/test_routes/test_analysis.py`:
```python
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

MOCK_NARRATIVE = "Test narrative."
MOCK_RECS = '[{"strategy":"test","direction":"long_vol","legs":[],"rationale":"t","estimated_greeks":{"delta":0},"risk_reward":"t"}]'


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_analyze_returns_job_id(mock_s, mock_r, client):
    resp = await client.post(
        "/analyze/AAPL",
        json={
            "scanner_signals": {
                "iv_percentile": 0.85,
                "skew_kurtosis": 0.6,
                "dealer_gamma": -0.3,
                "term_structure": 0.9,
                "vanna": 0.7,
                "charm": 0.4,
                "composite": 0.72,
            },
            "auto_run": False,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)


async def test_analyze_auto_run_default_false(client):
    resp = await client.post(
        "/analyze/TSLA",
        json={
            "scanner_signals": {
                "iv_percentile": 0.5,
                "skew_kurtosis": 0.5,
                "dealer_gamma": 0.0,
                "term_structure": 0.5,
                "vanna": 0.5,
                "charm": 0.5,
                "composite": 0.5,
            },
        },
    )
    assert resp.status_code == 200
    assert "job_id" in resp.json()
```

- [ ] **Step 2: Update analysis route**

Replace `app/routes/analysis.py`:
```python
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from graphs.trader.graph import build_trader_graph
from graphs.trader.state import TraderState
from models.common import JobResponse, ScannerSignals

logger = structlog.get_logger()

router = APIRouter()


class AnalyzeRequest(BaseModel):
    scanner_signals: ScannerSignals
    auto_run: bool = False


async def _run_trader(state: TraderState) -> None:
    """Run the trader graph in the background."""
    try:
        graph = build_trader_graph(checkpointer=None)
        result = await graph.ainvoke(state)
        logger.info(
            "trader.complete",
            job_id=state["job_id"],
            symbol=state["symbol"],
            recs=len(result.get("trade_recs", [])),
        )
    except Exception as exc:
        logger.error(
            "trader.failed",
            job_id=state["job_id"],
            error=str(exc),
        )


@router.post("/analyze/{symbol}")
async def analyze(
    symbol: str,
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
) -> JobResponse:
    """Kick off the trader analysis graph for a symbol."""
    job_id = f"job-{uuid4().hex[:12]}"

    state: TraderState = {
        "symbol": symbol.upper(),
        "scanner_signals": request.scanner_signals,
        "auto_run": request.auto_run,
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": job_id,
        "checkpoints_hit": [],
        "user_inputs": {},
    }

    background_tasks.add_task(_run_trader, state)

    return JobResponse(job_id=job_id)
```

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/analysis.py tests/test_routes/test_analysis.py
git commit -m "feat: wire analysis route to trader graph execution"
```

---

### Task 9: Full Test Suite + Lint Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run pytest -v
```

Expected: All tests pass (52 from Plan 2 + new tests from Plan 3)

- [ ] **Step 2: Run linter and formatter**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check --fix .
uv run ruff format .
```

- [ ] **Step 3: Final verification and commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check .
uv run ruff format --check .
uv run pytest -v
git add -A
git commit -m "style: fix lint issues from trader graph implementation"
git log --oneline | head -10
```
