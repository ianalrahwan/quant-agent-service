# Pre-computed Analysis Cache

## Problem

Agent analysis takes ~25s per ticker. Users opening a ticker page must wait for the full pipeline (discovery, signal confirm, vol surface, narrative synthesis, trade recs). Scanner tickers — the ones users most likely click — should load instantly with pre-computed results refreshed every 5 minutes.

## Architecture

### Refresh Cycle (Backend)

An `asyncio` background task starts in the FastAPI lifespan. Every 5 minutes it:

1. Computes scanner signals for a set of tickers (replicating the frontend scanner logic)
2. Filters to tickers with composite score above threshold
3. Runs the orchestrator graph for each qualifying ticker
4. Upserts the result (narrative, trade recs, vol surface, logs) into a `cached_analyses` Postgres table
5. Deletes entries older than 1 hour (tickers that fell off the scanner)

### Read Path (User Opens Ticker)

```
User opens /ticker/AAPL
  → Frontend: GET /api/agent/cached/AAPL
    → Backend: SELECT * FROM cached_analyses WHERE symbol = 'AAPL'
    → If found and < 5 min old: return full analysis (instant)
    → If not found: return 404
  → Frontend populates UI immediately if cached
  → RUN ANALYSIS button remains available for fresh runs
```

### Write-through on Manual Runs

When a user manually triggers analysis via POST /analyze, the orchestrator also writes the completed result to `cached_analyses`. This means:
- Manual runs benefit future viewers
- Manually-analyzed tickers get cached even if not on the scanner

### Data Flow

```
                    ┌─────────────┐
                    │  Scheduler  │ every 5 min
                    │  (asyncio)  │
                    └──────┬──────┘
                           │
                    scan tickers
                    run orchestrator
                    for each ticker
                           │
                           ▼
                ┌──────────────────┐
                │  cached_analyses │  Postgres table
                │  (upsert)        │
                └────────┬─────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
     GET /cached/X   GET /cached/Y   POST /analyze/Z
     (instant)       (instant)       (also writes cache)
```

## Database

### New Table: `cached_analyses`

```sql
CREATE TABLE cached_analyses (
    symbol          TEXT PRIMARY KEY,
    scanner_signals JSONB NOT NULL,
    narrative       TEXT NOT NULL DEFAULT '',
    trade_recs      JSONB NOT NULL DEFAULT '[]',
    vol_surface     JSONB,
    phases_log      JSONB NOT NULL DEFAULT '[]',
    total_time      FLOAT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cached_analyses_created_at ON cached_analyses (created_at);
```

Single row per ticker. Upserted on each refresh cycle or manual run. The `created_at` column is used by the frontend to show "cached 2m ago".

### Migration

Alembic migration to create the table.

## Backend Changes

### 1. Alembic Migration

New migration file creating `cached_analyses` table.

### 2. Cache Repository (`data/cache_repo.py`)

Simple async functions:
- `upsert_cached_analysis(session, symbol, scanner_signals, narrative, trade_recs, vol_surface, phases_log, total_time)` — INSERT ON CONFLICT UPDATE
- `get_cached_analysis(session, symbol)` — SELECT by symbol, returns None if not found
- `delete_stale_analyses(session, max_age_seconds=3600)` — DELETE WHERE created_at < now() - interval

### 3. Scheduler (`app/scheduler.py`)

```python
async def analysis_refresh_loop(app):
    """Run every 5 minutes in the background."""
    while True:
        await asyncio.sleep(300)  # 5 min
        try:
            tickers = await compute_scanner_tickers()
            for ticker, signals in tickers:
                result = await run_cached_analysis(app, ticker, signals)
                await upsert_cached_analysis(...)
            await delete_stale_analyses(...)
        except Exception:
            logger.error("scheduler.refresh_failed", exc_info=True)
```

Started in the FastAPI lifespan alongside the SSE bus setup. Uses `asyncio.create_task()` so it doesn't block app startup.

### 4. Scanner Logic (`app/scanner.py`)

The frontend currently computes scanner signals from market data APIs (options chains, VIX, historical prices). The backend needs to replicate this to know which tickers to pre-compute.

This module:
- Fetches the same market data the frontend uses
- Computes the 7 scanner signals (iv_percentile, skew_kurtosis, dealer_gamma, term_structure, vanna, charm, composite)
- Returns list of (ticker, ScannerSignals) tuples for tickers above composite threshold

### 5. New Endpoint: `GET /cached/{symbol}`

```python
@router.get("/cached/{symbol}")
async def get_cached(symbol: str, session: AsyncSession = Depends(get_session)):
    result = await get_cached_analysis(session, symbol.upper())
    if result is None:
        raise HTTPException(404, "No cached analysis")
    return {
        "symbol": result.symbol,
        "narrative": result.narrative,
        "trade_recs": result.trade_recs,
        "vol_surface": result.vol_surface,
        "phases_log": result.phases_log,
        "total_time": result.total_time,
        "created_at": result.created_at.isoformat(),
    }
```

### 6. Write-through from Orchestrator

After the orchestrator completes (in `_run_orchestrator`), upsert the result into `cached_analyses`. This requires passing a DB session factory into the background task, or using a standalone session.

### 7. Fix: Trade Rec JSON Parsing

In `graphs/trader/nodes/trade_rec.py`, strip markdown code fences before `json.loads()`:

```python
import re

# Strip markdown code fences Claude often adds
cleaned = re.sub(r"^```(?:json)?\s*\n?", "", response.strip())
cleaned = re.sub(r"\n?```\s*$", "", cleaned)
recs_data = json.loads(cleaned)
```

This is a bug fix independent of the caching feature but critical for trade recs to actually work.

## Frontend Changes

### 1. New API Route: `GET /api/agent/cached/[symbol]`

Proxy route (like the existing analyze and poll routes) that forwards to `GET ${BACKEND_URL}/cached/{symbol}`.

### 2. Update `useAgentAnalysis` Hook

On mount (or when symbol changes):
- Fetch `GET /api/agent/cached/{symbol}`
- If 200: populate state with cached data — all phases set to "complete", narrative filled, trade recs populated, bear shows COMPLETE state
- If 404: stay in idle state, user can click RUN ANALYSIS
- Add `cachedAt: string | null` to state for the timestamp

### 3. UI: Cache Indicator

When showing cached results, display a subtle indicator like "cached 2m ago" near the completion banner. The RUN ANALYSIS button remains available and is relabeled to "REFRESH ANALYSIS" when viewing cached data.

## What We're NOT Building

- Per-user caching or personalization
- Cache invalidation beyond the 5-min refresh cycle and 1-hour TTL
- Separate ECS scheduled task or worker process
- Crawler fixes (earnings, news, podcast APIs) — separate effort
- Historical analysis storage or comparison

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude API cost: N tickers x 2 calls x 288/day | $$$ at scale | Start with top 5-10 composite tickers only; add cost monitoring |
| Scanner logic duplication (frontend + backend) | Drift between what frontend shows and what backend pre-computes | Extract scanner math into shared constants; accept minor drift for now |
| Scheduler crashes silently | Stale cache, users see old data | Log errors, add health check field; frontend shows cache age so staleness is visible |
| Long refresh cycle blocks event loop | Other requests slow down during refresh | Run each ticker analysis as a separate task; add concurrency limit |

## Estimated Tasks

6-8 implementation tasks:
1. Alembic migration for cached_analyses table
2. Cache repository (upsert/get/delete)
3. Fix trade_rec JSON parsing (code fence stripping)
4. Scanner signal computation module
5. Background scheduler with refresh loop
6. GET /cached/{symbol} endpoint + write-through from orchestrator
7. Frontend cached route + hook integration
8. Cache age indicator in UI
