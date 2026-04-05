# Plan 4: Orchestrator Graph Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Orchestrator Graph that composes the Trader and Discovery graphs as subgraphs, with a freshness check that conditionally runs discovery before analysis. Wire it into the analysis route. This is the capstone demonstrating LangGraph's subgraph composition pattern.

**Architecture:** LangGraph StateGraph with 3 nodes: `check_freshness` (queries source_runs table staleness), `run_discovery` (invokes discovery graph as subgraph for stale sources), `run_trader` (invokes trader graph as subgraph). Conditional edge skips discovery if all sources are fresh.

**Tech Stack:** LangGraph (StateGraph, subgraph invocation), SQLAlchemy async (freshness queries), existing discovery + trader graphs

**Repo:** `~/Documents/Projects/quant-agent-backend`

---

## File Structure

```
graphs/
├── orchestrator/
│   ├── __init__.py
│   ├── graph.py               # Orchestrator StateGraph composing trader + discovery
│   ├── state.py               # OrchestratorState TypedDict
│   └── nodes/
│       ├── __init__.py
│       ├── check_freshness.py # Query source_runs for staleness
│       ├── run_discovery.py   # Invoke discovery subgraph
│       └── run_trader.py      # Invoke trader subgraph
tests/
├── test_graphs/
│   └── test_orchestrator.py   # Integration tests
├── test_nodes/
│   ├── test_check_freshness.py
│   ├── test_run_discovery.py
│   └── test_run_trader.py
```

---

### Task 1: Orchestrator State Types

**Files:**
- Create: `graphs/orchestrator/__init__.py`
- Create: `graphs/orchestrator/nodes/__init__.py`
- Create: `graphs/orchestrator/state.py`
- Test: `tests/test_orchestrator_state.py`

- [ ] **Step 1: Write the failing test**

`tests/test_orchestrator_state.py`:
```python
import typing

from graphs.orchestrator.state import FreshnessReport, OrchestratorState


def test_freshness_report():
    report = FreshnessReport(
        stale_sources=["earnings", "news"],
        fresh_sources=["podcast", "cftc"],
        all_fresh=False,
    )
    assert report.all_fresh is False
    assert "earnings" in report.stale_sources


def test_freshness_report_all_fresh():
    report = FreshnessReport(
        stale_sources=[],
        fresh_sources=["earnings", "news", "podcast", "cftc"],
        all_fresh=True,
    )
    assert report.all_fresh is True
    assert len(report.stale_sources) == 0


def test_orchestrator_state_shape():
    hints = typing.get_type_hints(OrchestratorState)
    expected = [
        "symbol",
        "scanner_signals",
        "auto_run",
        "freshness",
        "discovery_needed",
        "trader_narrative",
        "trader_trade_recs",
        "job_id",
    ]
    for key in expected:
        assert key in hints, f"Missing key: {key}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_orchestrator_state.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/orchestrator/__init__.py`: (empty)
`graphs/orchestrator/nodes/__init__.py`: (empty)

`graphs/orchestrator/state.py`:
```python
from typing import Any, TypedDict

from pydantic import BaseModel

from graphs.trader.state import TradeRecommendation
from models.common import ScannerSignals


class FreshnessReport(BaseModel):
    """Result of checking source freshness for a ticker."""

    stale_sources: list[str]
    fresh_sources: list[str]
    all_fresh: bool


class OrchestratorState(TypedDict):
    """Typed state for the orchestrator graph."""

    # Input
    symbol: str
    scanner_signals: ScannerSignals
    auto_run: bool

    # Freshness
    freshness: FreshnessReport | None
    discovery_needed: bool

    # Results (flattened from trader subgraph)
    trader_narrative: str
    trader_trade_recs: list[TradeRecommendation]

    # Metadata
    job_id: str
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/ tests/test_orchestrator_state.py
git commit -m "feat: add orchestrator state types"
```

---

### Task 2: Check Freshness Node

**Files:**
- Create: `graphs/orchestrator/nodes/check_freshness.py`
- Test: `tests/test_nodes/test_check_freshness.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_check_freshness.py`:
```python
from graphs.orchestrator.nodes.check_freshness import check_freshness_node
from graphs.orchestrator.state import OrchestratorState
from models.common import ScannerSignals


def _make_state(symbol: str = "AAPL") -> OrchestratorState:
    return {
        "symbol": symbol,
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": True,
        "freshness": None,
        "discovery_needed": False,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": "job-test",
    }


async def test_check_freshness_no_db_marks_stale():
    """Without DB, all sources are stale (never crawled)."""
    state = _make_state()
    result = await check_freshness_node(state)

    assert result["freshness"] is not None
    assert result["freshness"].all_fresh is False
    assert result["discovery_needed"] is True
    assert len(result["freshness"].stale_sources) == 4


async def test_check_freshness_returns_source_list():
    state = _make_state()
    result = await check_freshness_node(state)

    report = result["freshness"]
    for source in ["earnings", "news", "podcast", "cftc"]:
        assert source in report.stale_sources or source in report.fresh_sources
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/orchestrator/nodes/check_freshness.py`:
```python
import structlog

from data.models import SourceType
from graphs.discovery.schedule import CRAWL_CADENCE, is_stale
from graphs.orchestrator.state import FreshnessReport, OrchestratorState

logger = structlog.get_logger()

ALL_SOURCES = [SourceType.EARNINGS, SourceType.NEWS, SourceType.PODCAST, SourceType.CFTC]


async def check_freshness_node(state: OrchestratorState) -> dict:
    """Check which data sources are stale for this ticker.

    In production, queries the source_runs table for last crawl timestamps.
    Without a DB session, assumes all sources are stale (never crawled).
    """
    symbol = state["symbol"]
    stale: list[str] = []
    fresh: list[str] = []

    for source_type in ALL_SOURCES:
        # Without DB: assume never crawled → stale
        last_run = None
        if is_stale(source_type, last_run):
            stale.append(source_type.value)
        else:
            fresh.append(source_type.value)

    all_fresh = len(stale) == 0
    report = FreshnessReport(
        stale_sources=stale,
        fresh_sources=fresh,
        all_fresh=all_fresh,
    )

    logger.info(
        "check_freshness.done",
        symbol=symbol,
        stale=stale,
        fresh=fresh,
    )

    return {
        "freshness": report,
        "discovery_needed": not all_fresh,
    }
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/nodes/check_freshness.py tests/test_nodes/test_check_freshness.py
git commit -m "feat: add freshness check node"
```

---

### Task 3: Run Discovery Node (Subgraph)

**Files:**
- Create: `graphs/orchestrator/nodes/run_discovery.py`
- Test: `tests/test_nodes/test_run_discovery.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_run_discovery.py`:
```python
import respx
from httpx import Response

from graphs.orchestrator.nodes.run_discovery import run_discovery_node
from graphs.orchestrator.state import FreshnessReport, OrchestratorState
from models.common import ScannerSignals


@respx.mock
async def test_run_discovery_invokes_graph():
    """Discovery subgraph runs for stale sources."""
    # Mock all external APIs that discovery crawlers hit
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/AAPL").mock(
        return_value=Response(200, json=[])
    )
    respx.route().mock(return_value=Response(200, text=""))

    state: OrchestratorState = {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": True,
        "freshness": FreshnessReport(
            stale_sources=["earnings"],
            fresh_sources=["news", "podcast", "cftc"],
            all_fresh=False,
        ),
        "discovery_needed": True,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": "job-test",
    }

    result = await run_discovery_node(state)

    # Should return without error (discovery ran for stale sources)
    assert "discovery_needed" in result
    assert result["discovery_needed"] is False
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/orchestrator/nodes/run_discovery.py`:
```python
from datetime import datetime

import structlog

from data.models import SourceType
from graphs.discovery.graph import build_discovery_graph
from graphs.discovery.state import DiscoveryState
from graphs.orchestrator.state import OrchestratorState

logger = structlog.get_logger()


async def run_discovery_node(state: OrchestratorState) -> dict:
    """Run the discovery subgraph for stale sources."""
    freshness = state.get("freshness")
    symbol = state["symbol"]

    stale_types = []
    if freshness:
        stale_types = [SourceType(s) for s in freshness.stale_sources]

    discovery_state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": [symbol],
        "source_types": stale_types if stale_types else None,
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": f"orch-{state['job_id']}",
        "started_at": datetime.utcnow(),
        "completed_sources": [],
    }

    graph = build_discovery_graph()
    result = await graph.ainvoke(discovery_state)

    logger.info(
        "run_discovery.done",
        symbol=symbol,
        documents=len(result.get("raw_documents", [])),
        errors=len(result.get("crawl_errors", [])),
    )

    return {"discovery_needed": False}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/nodes/run_discovery.py tests/test_nodes/test_run_discovery.py
git commit -m "feat: add discovery subgraph invocation node"
```

---

### Task 4: Run Trader Node (Subgraph)

**Files:**
- Create: `graphs/orchestrator/nodes/run_trader.py`
- Test: `tests/test_nodes/test_run_trader.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_run_trader.py`:
```python
from unittest.mock import patch

from graphs.orchestrator.nodes.run_trader import run_trader_node
from graphs.orchestrator.state import OrchestratorState
from models.common import ScannerSignals

MOCK_NARRATIVE = "AAPL vol elevated."
MOCK_RECS = (
    '[{"strategy":"calendar_spread","direction":"long_vol",'
    '"legs":[],"rationale":"test",'
    '"estimated_greeks":{"delta":0},"risk_reward":"test"}]'
)


@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_run_trader_invokes_graph(mock_synth, mock_rec):
    state: OrchestratorState = {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": True,
        "freshness": None,
        "discovery_needed": False,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": "job-test",
    }

    result = await run_trader_node(state)

    assert len(result["trader_narrative"]) > 0
    assert len(result["trader_trade_recs"]) > 0
    assert result["trader_trade_recs"][0].strategy == "calendar_spread"
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/orchestrator/nodes/run_trader.py`:
```python
import structlog

from graphs.trader.graph import build_trader_graph
from graphs.trader.state import TraderState
from graphs.orchestrator.state import OrchestratorState

logger = structlog.get_logger()


async def run_trader_node(state: OrchestratorState) -> dict:
    """Run the trader analysis subgraph."""
    trader_state: TraderState = {
        "symbol": state["symbol"],
        "scanner_signals": state["scanner_signals"],
        "auto_run": state["auto_run"],
        "confirmed_signals": None,
        "vol_analysis": None,
        "narrative_context": None,
        "narrative": "",
        "trade_recs": [],
        "job_id": state["job_id"],
        "checkpoints_hit": [],
        "user_inputs": {},
    }

    graph = build_trader_graph(checkpointer=None)
    result = await graph.ainvoke(trader_state)

    logger.info(
        "run_trader.done",
        symbol=state["symbol"],
        narrative_len=len(result.get("narrative", "")),
        recs=len(result.get("trade_recs", [])),
    )

    return {
        "trader_narrative": result.get("narrative", ""),
        "trader_trade_recs": result.get("trade_recs", []),
    }
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/nodes/run_trader.py tests/test_nodes/test_run_trader.py
git commit -m "feat: add trader subgraph invocation node"
```

---

### Task 5: Orchestrator Graph Wiring

**Files:**
- Create: `graphs/orchestrator/graph.py`
- Test: `tests/test_graphs/test_orchestrator.py`

- [ ] **Step 1: Write the failing test**

`tests/test_graphs/test_orchestrator.py`:
```python
from unittest.mock import patch

import respx
from httpx import Response

from graphs.orchestrator.graph import build_orchestrator_graph
from graphs.orchestrator.state import OrchestratorState
from models.common import ScannerSignals

MOCK_NARRATIVE = "AAPL vol elevated."
MOCK_RECS = (
    '[{"strategy":"calendar_spread","direction":"long_vol",'
    '"legs":[],"rationale":"test",'
    '"estimated_greeks":{"delta":0},"risk_reward":"test"}]'
)


def _make_state() -> OrchestratorState:
    return {
        "symbol": "AAPL",
        "scanner_signals": ScannerSignals(
            iv_percentile=0.85, skew_kurtosis=0.6, dealer_gamma=-0.3,
            term_structure=0.9, vanna=0.7, charm=0.4, composite=0.72,
        ),
        "auto_run": True,
        "freshness": None,
        "discovery_needed": False,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": "job-test",
    }


@respx.mock
@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_orchestrator_full_run(mock_synth, mock_rec):
    """Full orchestrator: freshness check → discovery (stale) → trader."""
    # Mock discovery crawlers
    respx.route().mock(return_value=Response(200, json=[]))
    respx.post("https://api.voyageai.com/v1/embeddings").mock(
        return_value=Response(200, json={"data": [{"embedding": [0.1] * 1024}], "usage": {"total_tokens": 1}})
    )

    graph = build_orchestrator_graph()
    state = _make_state()
    result = await graph.ainvoke(state)

    assert result["freshness"] is not None
    assert result["trader_narrative"] != ""
    assert len(result["trader_trade_recs"]) > 0


@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
@patch("graphs.orchestrator.nodes.check_freshness.is_stale", return_value=False)
async def test_orchestrator_skips_discovery_when_fresh(mock_stale, mock_synth, mock_rec):
    """When all sources are fresh, skip discovery and go straight to trader."""
    graph = build_orchestrator_graph()
    state = _make_state()
    result = await graph.ainvoke(state)

    assert result["freshness"] is not None
    assert result["freshness"].all_fresh is True
    assert result["discovery_needed"] is False
    assert len(result["trader_trade_recs"]) > 0
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

`graphs/orchestrator/graph.py`:
```python
from langgraph.graph import END, StateGraph

from graphs.orchestrator.nodes.check_freshness import check_freshness_node
from graphs.orchestrator.nodes.run_discovery import run_discovery_node
from graphs.orchestrator.nodes.run_trader import run_trader_node
from graphs.orchestrator.state import OrchestratorState


def _route_after_freshness(state: OrchestratorState) -> str:
    """Route to discovery or straight to trader based on freshness."""
    if state.get("discovery_needed", False):
        return "run_discovery"
    return "run_trader"


def build_orchestrator_graph():
    """Build and compile the orchestrator graph."""
    graph = StateGraph(OrchestratorState)

    graph.add_node("check_freshness", check_freshness_node)
    graph.add_node("run_discovery", run_discovery_node)
    graph.add_node("run_trader", run_trader_node)

    graph.set_entry_point("check_freshness")

    graph.add_conditional_edges("check_freshness", _route_after_freshness)

    graph.add_edge("run_discovery", "run_trader")
    graph.add_edge("run_trader", END)

    return graph.compile()
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/graph.py tests/test_graphs/test_orchestrator.py
git commit -m "feat: wire orchestrator graph with subgraph composition"
```

---

### Task 6: Wire Analysis Route to Orchestrator

**Files:**
- Modify: `app/routes/analysis.py`
- Update: `tests/test_routes/test_analysis.py`

- [ ] **Step 1: Update the analysis route to use orchestrator**

Replace `app/routes/analysis.py`:
```python
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from graphs.orchestrator.graph import build_orchestrator_graph
from graphs.orchestrator.state import OrchestratorState
from models.common import JobResponse, ScannerSignals

logger = structlog.get_logger()

router = APIRouter()


class AnalyzeRequest(BaseModel):
    scanner_signals: ScannerSignals
    auto_run: bool = False


async def _run_orchestrator(state: OrchestratorState) -> None:
    """Run the orchestrator graph in the background."""
    try:
        graph = build_orchestrator_graph()
        result = await graph.ainvoke(state)
        logger.info(
            "orchestrator.complete",
            job_id=state["job_id"],
            symbol=state["symbol"],
            recs=len(result.get("trader_trade_recs", [])),
        )
    except Exception as exc:
        logger.error(
            "orchestrator.failed",
            job_id=state["job_id"],
            error=str(exc),
        )


@router.post("/analyze/{symbol}")
async def analyze(
    symbol: str,
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
) -> JobResponse:
    """Kick off the full orchestrator graph for a symbol."""
    job_id = f"job-{uuid4().hex[:12]}"

    state: OrchestratorState = {
        "symbol": symbol.upper(),
        "scanner_signals": request.scanner_signals,
        "auto_run": request.auto_run,
        "freshness": None,
        "discovery_needed": False,
        "trader_narrative": "",
        "trader_trade_recs": [],
        "job_id": job_id,
    }

    background_tasks.add_task(_run_orchestrator, state)

    return JobResponse(job_id=job_id)
```

- [ ] **Step 2: Update test to mock all layers**

Replace `tests/test_routes/test_analysis.py`:
```python
from unittest.mock import patch

import respx
import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.main import create_app

MOCK_NARRATIVE = "Test narrative."
MOCK_RECS = (
    '[{"strategy":"test","direction":"long_vol","legs":[],'
    '"rationale":"t","estimated_greeks":{"delta":0},"risk_reward":"t"}]'
)


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@respx.mock
@patch("graphs.trader.nodes.trade_rec._call_claude", return_value=MOCK_RECS)
@patch("graphs.trader.nodes.synthesize._call_claude", return_value=MOCK_NARRATIVE)
async def test_analyze_returns_job_id(mock_s, mock_r, client):
    respx.route().mock(return_value=Response(200, json=[]))
    respx.post("https://api.voyageai.com/v1/embeddings").mock(
        return_value=Response(200, json={"data": [], "usage": {"total_tokens": 0}})
    )

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

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/analysis.py tests/test_routes/test_analysis.py
git commit -m "feat: wire analysis route to orchestrator graph"
```

---

### Task 7: Full Test Suite + Lint Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run pytest -v
```

Expected: All tests pass (68 from Plan 3 + new tests)

- [ ] **Step 2: Lint and format**

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
git commit -m "style: fix lint issues from orchestrator graph implementation"
git log --oneline | head -10
```
