# Agent Progress Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time progress logging to the agent workflow — backend nodes emit log messages stored in graph state, streamed via SSE to a new scrolling terminal log component on the frontend.

**Architecture:** New `logs` field on all graph states with merge reducer. Each node appends descriptive strings. New `LogEvent` SSE type. Frontend `AgentLog` component renders them in a scrolling monospace box below the phase pipeline.

**Tech Stack:** Python (LangGraph state, Pydantic), TypeScript/React (new component, hook update)

**Repos:** `~/Documents/Projects/quant-agent-backend` (Tasks 1-5) and `~/Documents/Projects/quant-agent-service` (Tasks 6-8)

---

## File Structure

**Backend (`quant-agent-backend`):**
```
models/events.py                    — add LogEvent
graphs/discovery/state.py           — add logs field
graphs/trader/state.py              — add logs field
graphs/orchestrator/state.py        — add logs field
graphs/trader/nodes/signal_confirm.py    — add log messages
graphs/trader/nodes/vol_surface.py       — add log messages
graphs/trader/nodes/narrative_query.py   — add log messages
graphs/trader/nodes/synthesize.py        — add log messages
graphs/trader/nodes/trade_rec.py         — add log messages
graphs/discovery/nodes/crawl_earnings.py — add log messages
graphs/discovery/nodes/crawl_news.py     — add log messages
graphs/discovery/nodes/crawl_podcasts.py — add log messages
graphs/discovery/nodes/crawl_cftc.py     — add log messages
graphs/discovery/nodes/chunk_embed.py    — add log messages
graphs/discovery/nodes/index.py          — add log messages
graphs/orchestrator/nodes/check_freshness.py — add log messages
graphs/orchestrator/nodes/run_discovery.py   — add log messages
graphs/orchestrator/nodes/run_trader.py      — add log messages
```

**Frontend (`quant-agent-service`):**
```
src/lib/agent-types.ts                    — add LogEvent, logs to state
src/hooks/useAgentAnalysis.ts             — add log listener
src/components/detail/AgentLog.tsx        — new component
src/components/detail/AgentPanel.tsx      — integrate AgentLog
```

---

### Task 1: Add LogEvent to Backend Models

**Files:**
- Modify: `models/events.py` in `~/Documents/Projects/quant-agent-backend`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:
```python
def test_log_event_serializes():
    from models.events import LogEvent

    event = LogEvent(message="Crawling earnings for AAPL...", phase="crawl_earnings")
    sse = event.to_sse()
    assert sse.event == "log"
    payload = json.loads(sse.data)
    assert payload["message"] == "Crawling earnings for AAPL..."
    assert payload["phase"] == "crawl_earnings"


def test_log_event_no_phase():
    from models.events import LogEvent

    event = LogEvent(message="Starting analysis...")
    sse = event.to_sse()
    payload = json.loads(sse.data)
    assert payload["message"] == "Starting analysis..."
    assert payload["phase"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_models.py::test_log_event_serializes -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Add LogEvent to models/events.py**

Add after the `ErrorEvent` class:
```python
class LogEvent(BaseModel):
    """Progress log message from a graph node."""

    message: str
    phase: str | None = None

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="log", data=self.model_dump_json())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add models/events.py tests/test_models.py
git commit -m "feat: add LogEvent SSE type for progress logging"
```

---

### Task 2: Add logs Field to All Graph States

**Files:**
- Modify: `graphs/discovery/state.py`
- Modify: `graphs/trader/state.py`
- Modify: `graphs/orchestrator/state.py`
- Test: `tests/test_trader_state.py` (update)

- [ ] **Step 1: Update DiscoveryState**

In `graphs/discovery/state.py`, add to the `DiscoveryState` TypedDict after `completed_sources`:
```python
    # Logs
    logs: Annotated[list[str], _merge_lists]
```

- [ ] **Step 2: Update TraderState**

In `graphs/trader/state.py`, first add the import and reducer at the top of the file:
```python
from typing import Annotated, Any, TypedDict
```

Add the reducer function before the Pydantic models:
```python
def _merge_lists(left: list, right: list) -> list:
    """Reducer that merges lists."""
    return left + right
```

Then add to the `TraderState` TypedDict after `user_inputs`:
```python
    # Logs
    logs: Annotated[list[str], _merge_lists]
```

- [ ] **Step 3: Update OrchestratorState**

In `graphs/orchestrator/state.py`, add the import and reducer:
```python
from typing import Annotated, TypedDict
```

```python
def _merge_lists(left: list, right: list) -> list:
    """Reducer that merges lists."""
    return left + right
```

Then add to `OrchestratorState` after `job_id`:
```python
    # Logs
    logs: Annotated[list[str], _merge_lists]
```

- [ ] **Step 4: Update test**

In `tests/test_trader_state.py`, update `test_trader_state_shape` to include `"logs"` in the expected keys list.

- [ ] **Step 5: Update all places that construct initial state dicts to include `logs: []`**

This includes:
- `app/routes/analysis.py` — add `"logs": []` to the OrchestratorState dict
- `app/routes/discovery.py` — add `"logs": []` to the DiscoveryState dict
- `graphs/orchestrator/nodes/run_discovery.py` — add `"logs": []` to the DiscoveryState dict
- `graphs/orchestrator/nodes/run_trader.py` — add `"logs": []` to the TraderState dict

- [ ] **Step 6: Run tests**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest -v`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/ app/routes/ tests/
git commit -m "feat: add logs field to all graph states"
```

---

### Task 3: Add Log Messages to Orchestrator Nodes

**Files:**
- Modify: `graphs/orchestrator/nodes/check_freshness.py`
- Modify: `graphs/orchestrator/nodes/run_discovery.py`
- Modify: `graphs/orchestrator/nodes/run_trader.py`

- [ ] **Step 1: Update check_freshness_node**

In `graphs/orchestrator/nodes/check_freshness.py`, update the return dict to include logs:

```python
    if all_fresh:
        log_msg = f"All sources fresh for {symbol}"
    else:
        log_msg = f"Sources stale for {symbol}: {', '.join(stale)}"

    return {
        "freshness": report,
        "discovery_needed": not all_fresh,
        "logs": [f"Checking source freshness for {symbol}...", log_msg],
    }
```

- [ ] **Step 2: Update run_discovery_node**

In `graphs/orchestrator/nodes/run_discovery.py`, update the return dict:

```python
    doc_count = len(result.get("raw_documents", []))
    error_count = len(result.get("crawl_errors", []))

    logs = [f"Running discovery for {symbol}..."]
    if doc_count > 0:
        logs.append(f"Discovery complete — {doc_count} documents indexed")
    if error_count > 0:
        logs.append(f"Discovery had {error_count} source errors (partial success)")

    return {"discovery_needed": False, "logs": logs}
```

- [ ] **Step 3: Update run_trader_node**

In `graphs/orchestrator/nodes/run_trader.py`, update the return dict:

```python
    rec_count = len(result.get("trade_recs", []))

    return {
        "trader_narrative": result.get("narrative", ""),
        "trader_trade_recs": result.get("trade_recs", []),
        "logs": [
            f"Starting trader analysis for {state['symbol']}...",
            f"Trader analysis complete — {rec_count} recommendations",
        ],
    }
```

- [ ] **Step 4: Run tests**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/ tests/test_graphs/ -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/nodes/
git commit -m "feat: add log messages to orchestrator nodes"
```

---

### Task 4: Add Log Messages to Trader Nodes

**Files:**
- Modify: `graphs/trader/nodes/signal_confirm.py`
- Modify: `graphs/trader/nodes/vol_surface.py`
- Modify: `graphs/trader/nodes/narrative_query.py`
- Modify: `graphs/trader/nodes/synthesize.py`
- Modify: `graphs/trader/nodes/trade_rec.py`

- [ ] **Step 1: Update signal_confirm_node**

Update the return dict in `signal_confirm.py`:

```python
    logs = [f"Validating scanner signals for {state['symbol']}..."]
    if is_valid:
        logs.append(f"Signals confirmed: {ts_regime}, composite {signals.composite:.2f}")
    else:
        logs.append(f"Signals too weak (composite {signals.composite:.2f})")

    return {"confirmed_signals": confirmed, "logs": logs}
```

- [ ] **Step 2: Update vol_surface_node**

Update the return dict in `vol_surface.py`:

```python
    return {
        "vol_analysis": analysis,
        "logs": [
            f"Analyzing vol surface for {state['symbol']}...",
            f"Vol surface: {regime}, IV {signals.iv_percentile:.0%}ile",
        ],
    }
```

- [ ] **Step 3: Update narrative_query_node**

Update the return dict in `narrative_query.py`:

```python
    return {
        "narrative_context": context,
        "logs": [
            f"Querying narrative context for {symbol}...",
            f"Found {len(earnings)} earnings, {len(news)} news, {len(podcasts)} podcast sources",
        ],
    }
```

- [ ] **Step 4: Update synthesize_node**

Update the return dict in `synthesize.py`:

```python
    return {
        "narrative": narrative,
        "logs": [
            f"Generating narrative with Claude for {state['symbol']}...",
            f"Narrative generated ({len(narrative)} chars)",
        ],
    }
```

- [ ] **Step 5: Update trade_rec_node**

Update the return dict in `trade_rec.py`:

```python
    return {
        "trade_recs": trade_recs,
        "logs": [
            f"Generating trade recommendations for {state['symbol']}...",
            f"Generated {len(trade_recs)} trade recommendations",
        ],
    }
```

- [ ] **Step 6: Run tests**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest -v`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/trader/nodes/
git commit -m "feat: add log messages to trader nodes"
```

---

### Task 5: Add Log Messages to Discovery Nodes

**Files:**
- Modify: `graphs/discovery/nodes/crawl_earnings.py`
- Modify: `graphs/discovery/nodes/crawl_news.py`
- Modify: `graphs/discovery/nodes/crawl_podcasts.py`
- Modify: `graphs/discovery/nodes/crawl_cftc.py`
- Modify: `graphs/discovery/nodes/chunk_embed.py`
- Modify: `graphs/discovery/nodes/index.py`

- [ ] **Step 1: Update crawl_earnings_node**

Update the return dict:

```python
    tickers_str = ", ".join(tickers) if tickers else "none"
    logs = [f"Crawling earnings transcripts for {tickers_str}..."]
    if documents:
        logs.append(f"Found {len(documents)} earnings transcripts")
    if errors:
        logs.append(f"Earnings crawl failed: {errors[0].error}")

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.EARNINGS],
        "logs": logs,
    }
```

- [ ] **Step 2: Update crawl_news_node**

Same pattern:

```python
    tickers_str = ", ".join(tickers) if tickers else "none"
    logs = [f"Crawling news for {tickers_str}..."]
    if documents:
        logs.append(f"Found {len(documents)} news articles")
    if errors:
        logs.append(f"News crawl failed: {errors[0].error}")

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.NEWS],
        "logs": logs,
    }
```

- [ ] **Step 3: Update crawl_podcasts_node**

```python
    logs = ["Crawling podcast feeds..."]
    if documents:
        logs.append(f"Found {len(documents)} podcast episodes")
    if errors:
        logs.append(f"Podcast crawl had {len(errors)} feed errors")

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.PODCAST],
        "logs": logs,
    }
```

- [ ] **Step 4: Update crawl_cftc_node**

```python
    logs = ["Fetching CFTC positioning data..."]
    if documents:
        logs.append(f"Parsed {len(documents)} CFTC positions")
    if errors:
        logs.append(f"CFTC fetch failed: {errors[0].error}")

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.CFTC],
        "logs": logs,
    }
```

- [ ] **Step 5: Update chunk_embed_node**

```python
    logs = []
    if raw_documents:
        logs.append(f"Chunking {len(raw_documents)} documents...")
        logs.append(f"Embedded {len(all_chunks)} chunks")

    return {"chunks": all_chunks, "embeddings_stored": len(all_chunks), "logs": logs}
```

- [ ] **Step 6: Update index_node**

```python
    return {
        "embeddings_stored": embeddings_stored,
        "logs": [f"Indexing {len(chunks)} chunks to pgvector..."],
    }
```

- [ ] **Step 7: Run full test suite**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest -v`
Expected: All pass

- [ ] **Step 8: Lint and commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check --fix . && uv run ruff format .
git add graphs/discovery/nodes/
git commit -m "feat: add log messages to discovery nodes"
```

---

### Task 6: Add LogEvent Type and logs to Frontend State

**Files:**
- Modify: `src/lib/agent-types.ts` in `~/Documents/Projects/quant-agent-service`

- [ ] **Step 1: Add LogEvent interface**

Add after `ErrorEvent` in `agent-types.ts`:

```typescript
export interface LogEvent {
  message: string;
  phase?: string;
}
```

- [ ] **Step 2: Add logs to AgentAnalysisState**

Add `logs: string[];` to the `AgentAnalysisState` interface:

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
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/lib/agent-types.ts
git commit -m "feat: add LogEvent type and logs to agent state"
```

---

### Task 7: Add Log Listener to useAgentAnalysis Hook

**Files:**
- Modify: `src/hooks/useAgentAnalysis.ts`

- [ ] **Step 1: Add logs to initialState**

In the `initialState()` function, add `logs: []`:

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
  };
}
```

- [ ] **Step 2: Add LogEvent import**

Add `LogEvent` to the import from `@/lib/agent-types`.

- [ ] **Step 3: Add log event listener**

After the `es.addEventListener("stream", ...)` block, add:

```typescript
        es.addEventListener("log", (e) => {
          const data: LogEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            logs: [...prev.logs, data.message],
          }));
        });
```

- [ ] **Step 4: Add frontend-generated logs for checkpoint/done/error**

In the `checkpoint` listener, add a log line:
```typescript
        es.addEventListener("checkpoint", (e) => {
          const data: CheckpointEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "checkpoint",
            checkpointMessage: data.message,
            logs: [...prev.logs, `⏸ Awaiting input: ${data.message}`],
          }));
        });
```

In the `done` listener:
```typescript
        es.addEventListener("done", (e) => {
          const data: DoneEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "complete",
            totalTime: data.total_time,
            logs: [...prev.logs, `✓ Analysis complete in ${data.total_time.toFixed(1)}s`],
          }));
          es.close();
        });
```

In the `error` listener (the MessageEvent branch):
```typescript
            setState((prev) => ({
              ...prev,
              status: "error",
              error: data.error,
              logs: [...prev.logs, `✗ Error: ${data.error}`],
            }));
```

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/hooks/useAgentAnalysis.ts
git commit -m "feat: add log event listener to useAgentAnalysis hook"
```

---

### Task 8: Create AgentLog Component and Integrate into AgentPanel

**Files:**
- Create: `src/components/detail/AgentLog.tsx`
- Modify: `src/components/detail/AgentPanel.tsx`

- [ ] **Step 1: Create AgentLog component**

`src/components/detail/AgentLog.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";

interface AgentLogProps {
  logs: string[];
}

export function AgentLog({ logs }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) return null;

  const now = new Date();

  return (
    <div className="bg-bb-darkgray border border-bb-gray max-h-[150px] overflow-y-auto font-mono text-xs">
      {logs.map((msg, i) => (
        <div key={i} className="px-2 py-0.5 text-bb-white/80 border-b border-bb-gray/30 last:border-0">
          <span className="text-bb-gray mr-2">
            [{now.getHours().toString().padStart(2, "0")}:
            {now.getMinutes().toString().padStart(2, "0")}:
            {now.getSeconds().toString().padStart(2, "0")}]
          </span>
          {msg}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Add AgentLog to AgentPanel**

In `src/components/detail/AgentPanel.tsx`, add the import:
```typescript
import { AgentLog } from "./AgentLog";
```

Add the log component after the phase pipeline section and before the checkpoint message:

```tsx
      {/* Log output */}
      {state.logs.length > 0 && (
        <div className="mb-3">
          <AgentLog logs={state.logs} />
        </div>
      )}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/detail/AgentLog.tsx src/components/detail/AgentPanel.tsx
git commit -m "feat: add scrolling terminal log component to agent panel"
```

---

### Task 9: Verification

- [ ] **Step 1: Run backend tests**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check . && uv run pytest -v
```

- [ ] **Step 2: Check frontend compiles**

```bash
cd ~/Documents/Projects/quant-agent-service
npx tsc --noEmit
```

- [ ] **Step 3: Verify git history**

```bash
cd ~/Documents/Projects/quant-agent-backend && git log --oneline | head -5
cd ~/Documents/Projects/quant-agent-service && git log --oneline | head -5
```
