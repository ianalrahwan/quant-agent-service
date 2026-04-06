# Agent Progress Logs — Design Spec

**Date:** 2026-04-06
**Status:** Draft

---

## Overview

Add real-time progress logging to the agent workflow. Backend graph nodes emit human-readable log messages as they work, stored in graph state and streamed to the frontend via a new `log` SSE event type. Frontend renders them in a scrolling terminal-style log component below the phase pipeline.

## Backend Changes

### New SSE Event Type

Add `LogEvent` to `models/events.py`:

```python
class LogEvent(BaseModel):
    message: str
    phase: str | None = None

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="log", data=self.model_dump_json())
```

### State Changes

Add `logs: list[str]` to all three graph states using a merge reducer (same pattern as `raw_documents`):

- `TraderState.logs: Annotated[list[str], _merge_lists]`
- `DiscoveryState.logs: Annotated[list[str], _merge_lists]`
- `OrchestratorState.logs: Annotated[list[str], _merge_lists]`

### Node Log Messages

Each node appends log strings to state. The messages are:

**Orchestrator nodes:**

| Node | Messages |
|------|----------|
| `check_freshness` | `"Checking source freshness for {symbol}..."`, `"Sources stale: {list}"` or `"All sources fresh"` |
| `run_discovery` | `"Running discovery for stale sources..."`, `"Discovery complete — {n} documents indexed"` |
| `run_trader` | `"Starting trader analysis..."`, `"Trader analysis complete"` |

**Discovery nodes:**

| Node | Messages |
|------|----------|
| `crawl_earnings` | `"Crawling earnings transcripts for {tickers}..."`, `"Found {n} earnings transcripts"` or `"Earnings crawl failed: {error}"` |
| `crawl_news` | `"Crawling news for {tickers}..."`, `"Found {n} news articles"` or `"News crawl failed: {error}"` |
| `crawl_podcasts` | `"Crawling podcast feeds..."`, `"Found {n} podcast episodes"` or `"Podcast crawl failed: {error}"` |
| `crawl_cftc` | `"Fetching CFTC positioning data..."`, `"Parsed {n} CFTC positions"` or `"CFTC fetch failed: {error}"` |
| `chunk_embed` | `"Chunking {n} documents..."`, `"Embedded {n} chunks"` |
| `index` | `"Indexing {n} chunks to pgvector..."` |

**Trader nodes:**

| Node | Messages |
|------|----------|
| `signal_confirm` | `"Validating scanner signals..."`, `"Signals confirmed: {regime}, composite {score}"` or `"Signals too weak (composite {score})"` |
| `vol_surface` | `"Analyzing vol surface..."`, `"Vol surface: {regime}, IV {pct}%ile"` |
| `narrative_query` | `"Querying narrative context..."`, `"Found {n} earnings, {n} news, {n} podcast sources"` |
| `synthesize` | `"Generating narrative with Claude..."`, `"Narrative generated ({n} chars)"` |
| `trade_rec` | `"Generating trade recommendations..."`, `"Generated {n} trade recommendations"` |

### SSE Emission

The analysis route's background task reads `logs` from the graph result after each invocation and emits `LogEvent` SSE messages. Since the graph runs as `ainvoke` (not streaming), logs are emitted in batches after each graph completion — not truly real-time within a single invocation.

For the orchestrator flow (check_freshness → discovery → trader), this means logs appear in three bursts: after freshness check, after discovery, and after trader. This is acceptable — the phase pipeline shows real-time progress, the logs provide detail.

## Frontend Changes

### New TypeScript Types

Add to `agent-types.ts`:

```typescript
export interface LogEvent {
  message: string;
  phase?: string;
}
```

Add to `AgentAnalysisState`:

```typescript
logs: string[];
```

### Hook Changes

In `useAgentAnalysis.ts`, add a `log` event listener:

```typescript
es.addEventListener("log", (e) => {
  const data: LogEvent = JSON.parse(e.data);
  setState((prev) => ({
    ...prev,
    logs: [...prev.logs, data.message],
  }));
});
```

Also generate frontend-side log messages for events that don't come from the backend (checkpoint, done, error):

- Checkpoint: `"⏸ Awaiting input: {message}"`
- Done: `"✓ Analysis complete in {time}s"`
- Error: `"✗ Error: {error}"`

### New Component: AgentLog

`src/components/detail/AgentLog.tsx` — scrolling terminal log:

- Monospace font, `bg-bb-darkgray`, `border-bb-gray`
- Each line prefixed with a timestamp `[HH:MM:SS]`
- Auto-scrolls to bottom on new messages
- Max height 150px with `overflow-y-auto`
- Shows when `logs.length > 0`

### Placement in AgentPanel

Between the phase pipeline and the checkpoint/narrative sections:

```
[Bear] AGENT ANALYSIS          [RUN ANALYSIS]
FRESH → DISC → SIG → VOL → NAR → SYN → REC
┌──────────────────────────────────────────┐
│ [02:15:01] Checking source freshness...  │
│ [02:15:02] Sources stale: earnings, news │
│ [02:15:03] Crawling earnings for AAPL... │
│ [02:15:05] Found 2 earnings transcripts  │
│ [02:15:05] Crawling news for AAPL...     │
│ [02:15:07] Found 5 news articles         │
│ [02:15:08] Validating scanner signals... │
│ [02:15:08] Signals confirmed: backwarda… │
└──────────────────────────────────────────┘
⏸ Vol surface analysis ready. Continue?
[NARRATIVE SECTION]
[TRADE REC CARDS]
```

## Proxy Route

No changes needed — the existing `/api/agent/stream/[jobId]/route.ts` passes through all SSE events including the new `log` type.
