# LangGraph Agent Backend — Design Spec

**Date:** 2026-04-05
**Status:** Draft
**Branch:** feature/langgraph

---

## 1. Overview

A Python backend service that orchestrates quantitative volatility analysis agents using LangGraph. It connects high-quality data sources (earnings transcripts, podcast transcripts, news sentiment, CFTC positioning) to long volatility / high vanna options plays and vol calendar spread recommendations.

The system is designed as a portfolio piece that showcases advanced LangGraph patterns: subgraph composition, parallel fan-out/fan-in, human-in-the-loop checkpoints, conditional routing, tool calling, and async checkpointing.

### Architecture Decision

- **Separate repo** (`quant-agent-backend`) from the existing Next.js frontend (`quant-agent-service`)
- Frontend on Vercel, backend on AWS ECS Fargate
- Communication via REST + SSE (Server-Sent Events)
- LLM: Claude (Anthropic API) for synthesis and reasoning nodes

### Why Separate Repos

1. Portfolio clarity — clean Python backend repo, clean Next.js frontend repo
2. Deploy independence — Vercel and ECS have different deploy models
3. Existing frontend works as-is — no restructuring needed
4. API contract as boundary — forces clean interface design

---

## 2. Trader Analysis Graph

The core workflow. Takes a ticker + scanner signals, analyzes vol surface, gathers narrative context from multiple sources, synthesizes a "why" explanation, and recommends trade structures.

### Graph Topology

```
signal_confirm → vol_surface → CHECKPOINT #1
    → [parallel] earnings, news, podcast, positioning
    → narrative_agg → CHECKPOINT #2
    → synthesize → CHECKPOINT #3
    → trade_rec → DONE
```

### Nodes

| Node | Purpose | LangGraph Pattern |
|------|---------|-------------------|
| `signal_confirm` | Validate scanner signals, short-circuit if stale | Conditional entry |
| `vol_surface` | Term structure, skew, IV analysis, greeks, regime detection | Tool use (market data APIs) |
| `earnings` | Fetch + extract from earnings transcripts | Tool use (FMP API + pgvector query) |
| `news` | Aggregate news sentiment | Parallel fan-out |
| `podcast` | Fetch + extract from podcast transcripts | Parallel fan-out, async |
| `positioning` | CFTC / macro positioning data | Parallel fan-out |
| `narrative_agg` | Aggregate all source context, handle partial failures | Fan-in aggregation |
| `synthesize` | Claude: "why does this ticker have this vol regime?" | LLM synthesis, streaming |
| `trade_rec` | Recommend spreads / long-dated vol plays | LLM structured output |

### Checkpoints (Human-in-the-Loop)

Three checkpoints where the graph suspends and sends current state via SSE:

1. **After vol_surface** — "Here's the vol surface analysis. Continue?"
2. **After narrative_agg** — "Here's the context gathered. Proceed to synthesis?"
3. **After synthesize** — "Here's the narrative. Generate trade recs?"

When `auto_run=True`, checkpoints are skipped and the graph runs end-to-end.

### State

```python
class TraderState(TypedDict):
    # Input
    symbol: str
    scanner_signals: ScannerSignals
    auto_run: bool

    # Phase 1: Signal confirmation
    confirmed_signals: ConfirmedSignals

    # Phase 2: Vol surface
    vol_analysis: VolSurfaceAnalysis

    # Phase 3: Narrative sources (parallel)
    earnings_context: list[EarningsExtract]
    news_context: list[NewsExtract]
    podcast_context: list[PodcastExtract]
    positioning_context: PositioningData

    # Phase 4: Synthesis
    narrative: str

    # Phase 5: Trade recommendation
    trade_recs: list[TradeRecommendation]

    # Metadata
    job_id: str
    checkpoints_hit: list[str]
    user_inputs: dict[str, Any]
```

### Trade Recommendation Logic

The `trade_rec` node focuses on:
1. Optimal expiry pairs for calendar spreads (where backwardation is steepest)
2. Long-dated calls/puts where vanna flow would amplify a directional move
3. Structured output: strikes, expiries, estimated greeks, risk/reward rationale

---

## 3. Resource Discovery Graph

Runs on a separate cadence from the trader workflow. Keeps the knowledge base fresh by crawling and indexing data sources.

### Graph Topology

```
trigger → [parallel] crawl_earnings, crawl_podcasts, crawl_news, crawl_cftc
    → chunk_embed → index → DONE
```

### Crawler Nodes

| Node | Source | Cadence | Method |
|------|--------|---------|--------|
| `crawl_earnings` | SEC EDGAR + Financial Modeling Prep | Daily (market hours) | API → parse 10-Q/8-K/earnings call transcripts |
| `crawl_podcasts` | RSS feeds (Macro Voices, Odd Lots, etc.) | Every 6 hours | Fetch episodes → Whisper transcription via API |
| `crawl_news` | News API (NewsAPI, Benzinga, or similar) | Every 30 min | Keyword search per ticker → extract relevant paragraphs |
| `crawl_cftc` | CFTC Commitments of Traders | Weekly (Tuesday release) | Download CSV → parse futures positioning by commodity |

### LangGraph Patterns

- **Parallel fan-out with heterogeneous nodes** — each crawler has different logic but shares `RawDocument` output type
- **Partial failure tolerance** — one crawler failing doesn't stop the graph
- **Dynamic node selection** — `source_types` input controls which crawlers run (conditional edges)
- **Async long-running work** — podcast transcription checkpoints and resumes

### State

```python
class DiscoveryState(TypedDict):
    trigger_type: Literal["scheduled", "manual"]
    target_tickers: list[str] | None
    source_types: list[SourceType] | None
    raw_documents: list[RawDocument]
    crawl_errors: list[CrawlError]
    chunks: list[DocumentChunk]
    embeddings_stored: int
    run_id: str
    started_at: datetime
    completed_sources: list[SourceType]
```

---

## 4. Orchestrator Graph (Subgraph Composition)

Thin top-level graph that composes the trader and discovery graphs.

### Graph Topology

```
entry → check_freshness → [conditional] discovery_sub (if stale) → trader_sub → DONE
```

### Freshness Logic

- Queries `source_runs` table for last successful crawl per source type per ticker
- Earnings >24h old, news >1h old, CFTC >1 week old → stale
- If stale → runs targeted discovery subgraph (only stale sources, only this ticker)
- If fresh → skips directly to trader graph

### State

```python
class OrchestratorState(TypedDict):
    symbol: str
    scanner_signals: ScannerSignals
    auto_run: bool
    freshness: FreshnessReport
    discovery_needed: bool
    discovery_result: DiscoveryState | None
    trader_result: TraderState
    job_id: str
```

### LangGraph Patterns

- **Subgraph composition** — both graphs invoked as compiled subgraphs with state mapping
- **Conditional branching** — freshness determines discovery execution
- **State nesting** — orchestrator wraps child graph states

---

## 5. Shared Data Layer

The trader and discovery graphs communicate through a shared PostgreSQL + pgvector database, not direct graph-to-graph calls.

### Schema

```sql
-- Indexed documents from crawlers
documents (id, source_type, ticker, published_at, title, url, raw_text)

-- Chunked + embedded for RAG
chunks (id, document_id, chunk_text, embedding vector, chunk_index)

-- Crawl run tracking
source_runs (id, run_id, source_type, status, documents_found, errors, completed_at)
```

The trader graph's narrative nodes query pgvector with similarity search scoped by ticker + time window.

### Embedding Model

Anthropic's `voyage-3` (or OpenAI `text-embedding-3-small` as fallback) for chunk embeddings. 1024-dimension vectors stored in pgvector.

---

## 6. API & SSE Contract

### Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /analyze/{symbol}` | POST | Kick off orchestrator graph, returns `{ job_id }` |
| `GET /stream/{job_id}` | GET | SSE endpoint, streams phase completions + checkpoints |
| `POST /stream/{job_id}/resume` | POST | Resume from checkpoint with optional user input |
| `POST /discover` | POST | Manually trigger resource discovery |
| `GET /sources/{symbol}/summary` | GET | What's indexed for a ticker (for scanner badges) |
| `GET /health` | GET | Health check |

### SSE Event Types

```
event: phase       — Node started/completed with data
event: checkpoint  — Graph paused, awaiting user input
event: stream      — Token-by-token LLM output (synthesis node)
event: done        — Workflow complete
event: error       — Node or graph-level error
```

### SSE Event Flow Example

```
event: phase
data: {"phase": "freshness_check", "status": "complete", "discovery_needed": true}

event: phase
data: {"phase": "discovery", "status": "in_progress", "sources": ["earnings", "news"]}

event: phase
data: {"phase": "discovery", "status": "complete", "documents_indexed": 12}

event: phase
data: {"phase": "vol_surface", "status": "complete", "data": { ...vol surface JSON }}

event: checkpoint
data: {"checkpoint": "vol_surface_review", "message": "Vol surface analysis ready. Continue?"}

event: phase
data: {"phase": "narrative_sources", "status": "in_progress", "fan_out": 4}

event: checkpoint
data: {"checkpoint": "narrative_review", "message": "Context gathered. Proceed to synthesis?"}

event: stream
data: {"phase": "synthesis", "token": "The"}

event: checkpoint
data: {"checkpoint": "trade_review", "message": "Narrative complete. Generate trade recs?"}

event: phase
data: {"phase": "trade_rec", "status": "complete", "data": { ...trade recs JSON }}

event: done
data: {"job_id": "...", "total_time": 47.2}
```

---

## 7. Frontend Integration

Changes to the existing `quant-agent-service` (Next.js) repo.

### Scanner Page

New badges on `ScannerTable.tsx` rows sourced from `GET /sources/{symbol}/summary`:
- **CAT** — earnings catalyst within 7 days or recent transcript indexed
- **NEWS** — high-volume news activity
- **POS** — notable CFTC positioning shift

Polled every 5 minutes (ambient context, not real-time).

### Ticker Detail Page

New **"Agent Analysis"** panel below existing charts:
1. Bear mascot in idle state with "Run deep analysis?" prompt
2. User clicks (or types `ANALYZE` / `F5` in command line) → `POST /analyze/{symbol}`
3. SSE connection opens → panel fills progressively:
   - Horizontal phase pipeline (active/complete/pending indicators)
   - Vol surface review renders at checkpoint 1
   - Source cards appear as each narrative source completes
   - Claude's narrative streams token-by-token in terminal-style text
   - Trade recommendation cards with strikes/expiries/greeks/rationale
4. At checkpoints, user clicks "Continue" or types `CONTINUE` in command line

### Bear Mascot States

| State | Visual | When |
|-------|--------|------|
| Idle | Sitting, waiting | Before analysis starts |
| Thinking | Animated (CSS) | Graph nodes running |
| Checkpoint | Looking at user | Human-in-the-loop pause |
| Complete | Thumbs up | Workflow done |

### Command Line Commands

- `ANALYZE` / `F5` — trigger agent workflow
- `CONTINUE` — resume from checkpoint
- `AUTO` — toggle auto-run mode
- `SOURCES` — show indexed sources for this ticker

### Connectivity

- Frontend calls backend ECS directly (not proxied through Next.js API routes)
- Backend sets CORS for Vercel domain
- Backend URL via environment variable

---

## 8. Repo Structure

**New repo: `quant-agent-backend`**

```
quant-agent-backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── dependencies.py
│   └── routes/
│       ├── analysis.py
│       ├── stream.py
│       ├── discovery.py
│       └── health.py
├── graphs/
│   ├── trader/
│   │   ├── graph.py
│   │   ├── state.py
│   │   ├── nodes/
│   │   │   ├── signal_confirm.py
│   │   │   ├── vol_surface.py
│   │   │   ├── narrative_fan.py
│   │   │   ├── earnings.py
│   │   │   ├── news.py
│   │   │   ├── podcast.py
│   │   │   ├── positioning.py
│   │   │   ├── synthesize.py
│   │   │   └── trade_rec.py
│   │   └── checkpoints.py
│   ├── discovery/
│   │   ├── graph.py
│   │   ├── state.py
│   │   ├── nodes/
│   │   │   ├── crawl_earnings.py
│   │   │   ├── crawl_podcasts.py
│   │   │   ├── crawl_news.py
│   │   │   ├── crawl_cftc.py
│   │   │   ├── chunk_embed.py
│   │   │   └── index.py
│   │   └── schedule.py
│   └── orchestrator/
│       ├── graph.py
│       └── state.py
├── data/
│   ├── market.py
│   ├── sources.py
│   └── models.py
├── db/
│   ├── models.py
│   ├── migrations/
│   └── session.py
├── tests/
│   ├── test_graphs/
│   ├── test_nodes/
│   └── test_routes/
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
└── README.md
```

---

## 9. Infrastructure

### AWS ECS Fargate

- **API task** — FastAPI server, 0.5 vCPU / 1GB, 2+ tasks behind ALB, handles `/analyze`, `/stream`, `/health`
- **Worker task** — Scheduled discovery jobs via ECS Scheduled Tasks / EventBridge, scales to 0 between runs
- **ALB** — SSL termination, idle timeout ~120s for SSE streams

### Supporting Services

| Service | Purpose |
|---------|---------|
| RDS PostgreSQL + pgvector | Document store, embeddings, source metadata, job state |
| ElastiCache Redis | SSE pub-sub, checkpoint state |
| ECR | Docker image registry |
| Secrets Manager | Anthropic API key, DB credentials |
| CloudWatch | Logs (structlog → JSON), metrics, alarms |

### CI/CD

- GitHub Actions: push to `main` → build → ECR → ECS rolling deploy
- PR: tests, lint, type check

### Estimated Cost

~$100-130/month (Fargate ~$35, RDS ~$15, ElastiCache ~$12, ALB ~$18, Anthropic API ~$20-50)

### Local Dev

`docker-compose.yml` with Postgres + Redis + app. No AWS dependency for development.

---

## 10. Testing Strategy

### Three Layers

**1. Node unit tests** — Each node is a function: state in, state delta out. Pure computation tested deterministically. LLM calls tested with mock Anthropic client (verify prompt construction + response parsing).

**2. Graph integration tests** — Full graph execution with mocked external services. Verifies topology: correct fan-out/fan-in, conditional routing, state accumulation, checkpoint pause/resume, partial failure handling, auto-run mode.

**3. API/SSE tests** — httpx test client against FastAPI. Verifies SSE event stream order and content.

### Tooling

pytest + pytest-asyncio + httpx + respx (httpx mocking)

### Not Tested in CI

- No live API calls (Yahoo Finance, Claude, etc.) — flaky, slow, expensive
- No UI tests — frontend repo's concern

---

## 11. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Language | Python 3.12+ |
| Framework | FastAPI |
| Agent orchestration | LangGraph |
| LLM | Claude (Anthropic SDK) |
| Data validation | Pydantic v2 |
| Database | PostgreSQL + pgvector |
| Cache / pub-sub | Redis |
| HTTP client | httpx (async) |
| Logging | structlog |
| Package manager | UV |
| Deployment | AWS ECS Fargate |
| CI/CD | GitHub Actions |
| Testing | pytest, pytest-asyncio, httpx, respx |

---

## 12. LangGraph Patterns Demonstrated

| Pattern | Where |
|---------|-------|
| Subgraph composition | Orchestrator invokes trader + discovery as subgraphs |
| Parallel fan-out / fan-in | Trader: 4 narrative sources. Discovery: 4 crawlers |
| Human-in-the-loop checkpoints | 3 trader graph checkpoints with SSE pause/resume |
| Conditional routing | Orchestrator freshness check, signal_confirm short-circuit, dynamic crawler selection |
| Tool calling | Vol surface (market APIs), earnings/news (external APIs) |
| Stateful multi-turn | Checkpoint resume with user input preserved in state |
| Async long-running nodes | Podcast transcription with checkpoint/resume |
| Partial failure tolerance | Narrative fan-in handles missing sources gracefully |
| Streaming LLM output | Synthesis node streams tokens via SSE |
