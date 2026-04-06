# Pipeline Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the agent panel to the top of the ticker page and expand the pipeline to show the actual backend graph structure with parallel discovery crawlers as a two-row split.

**Architecture:** The backend discovery node switches from `ainvoke()` to `astream()` to emit per-crawler phase events. The frontend extends its phase model with new discovery sub-phases and replaces the flat pipeline component with a two-row layout (Discovery + Trader).

**Tech Stack:** Python/LangGraph (backend), React/TypeScript/Tailwind (frontend)

---

### Task 1: Backend — Emit per-crawler phase events from discovery

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/graphs/orchestrator/nodes/run_discovery.py`

- [ ] **Step 1: Write the updated run_discovery_node**

Replace `ainvoke()` with `astream()` and emit phase events per node, following the same pattern as `run_trader.py`:

```python
from datetime import UTC, datetime

import structlog

from data.models import SourceType
from graphs.discovery.graph import build_discovery_graph
from graphs.discovery.state import DiscoveryState
from graphs.orchestrator.state import OrchestratorState
from models.events import LogEvent, PhaseEvent
from sse.bus import emit

logger = structlog.get_logger()

# Map discovery node names to frontend phase names
DISCOVERY_PHASE_MAP = {
    "crawl_earnings": "crawl_earnings",
    "crawl_news": "crawl_news",
    "crawl_podcasts": "crawl_podcasts",
    "crawl_cftc": "crawl_cftc",
    "chunk_embed": "chunk_embed",
    "index": "index",
}


async def run_discovery_node(state: OrchestratorState) -> dict:
    """Run the discovery subgraph for stale sources, publishing SSE events per node."""
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
        "started_at": datetime.now(UTC),
        "completed_sources": [],
        "logs": [],
    }

    graph = build_discovery_graph()
    result = discovery_state

    async for chunk in graph.astream(discovery_state):
        for node_name, node_output in chunk.items():
            result = {**result, **node_output}

            # Publish log events
            for log_msg in node_output.get("logs", []):
                await emit(LogEvent(message=log_msg).to_sse())

            # Publish phase event
            phase = DISCOVERY_PHASE_MAP.get(node_name)
            if phase:
                await emit(PhaseEvent(phase=phase, status="complete").to_sse())

    logger.info(
        "run_discovery.done",
        symbol=symbol,
        documents=len(result.get("raw_documents", [])),
        errors=len(result.get("crawl_errors", [])),
    )

    doc_count = len(result.get("raw_documents", []))
    error_count = len(result.get("crawl_errors", []))

    logs = [f"Running discovery for {symbol}..."]
    if doc_count > 0:
        logs.append(f"Discovery complete — {doc_count} documents indexed")
    if error_count > 0:
        logs.append(f"Discovery had {error_count} source errors (partial success)")

    return {"discovery_needed": False, "logs": logs}
```

- [ ] **Step 2: Run backend tests**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run ruff check --fix . && uv run ruff format . && uv run pytest tests/ -v`
Expected: All 96 tests pass, no lint errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
git add graphs/orchestrator/nodes/run_discovery.py
git commit -m "feat: emit per-crawler phase events from discovery sub-graph"
```

---

### Task 2: Frontend — Extend AgentPhase type and update initial phases

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/lib/agent-types.ts`
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/hooks/useAgentAnalysis.ts`

- [ ] **Step 1: Update AgentPhase type in agent-types.ts**

Replace the existing `AgentPhase` type (lines 33-40):

```typescript
export type AgentPhase =
  | "freshness_check"
  // Discovery (parallel crawlers + sequential processing)
  | "crawl_earnings"
  | "crawl_news"
  | "crawl_podcasts"
  | "crawl_cftc"
  | "chunk_embed"
  | "index"
  // Trader (sequential)
  | "signal_confirm"
  | "vol_surface"
  | "narrative_sources"
  | "synthesis"
  | "trade_rec";
```

Also update `PhaseEvent.status` to include `"error"` (line 44):

```typescript
export interface PhaseEvent {
  phase: AgentPhase;
  status: "in_progress" | "complete" | "error";
  data?: Record<string, unknown>;
}
```

- [ ] **Step 2: Update INITIAL_PHASES in useAgentAnalysis.ts**

Replace `INITIAL_PHASES` (lines 21-29):

```typescript
const INITIAL_PHASES: [AgentPhase, "pending"][] = [
  ["freshness_check", "pending"],
  ["crawl_earnings", "pending"],
  ["crawl_news", "pending"],
  ["crawl_podcasts", "pending"],
  ["crawl_cftc", "pending"],
  ["chunk_embed", "pending"],
  ["index", "pending"],
  ["signal_confirm", "pending"],
  ["vol_surface", "pending"],
  ["narrative_sources", "pending"],
  ["synthesis", "pending"],
  ["trade_rec", "pending"],
];
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-service && npx tsc --noEmit`
Expected: No type errors. The `PhasePipeline` component will have a type error because `PHASE_LABELS` still references `"discovery"` — that's expected and will be fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/lib/agent-types.ts src/hooks/useAgentAnalysis.ts
git commit -m "feat: extend AgentPhase with discovery sub-phases"
```

---

### Task 3: Frontend — Move AgentPanel to top of right column

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/app/ticker/[symbol]/page.tsx`

- [ ] **Step 1: Move the Agent Analysis block above the chart panels**

In `page.tsx`, move the Agent Analysis `<div>` block (currently lines 271-282) to be the first child inside the right column `<div className="flex-1 overflow-auto">` (after line 175).

The moved block:

```tsx
          {/* Agent Analysis */}
          <div className="border-b border-bb-gray">
            <Panel title="Agent Analysis">
              <AgentPanel
                state={agentState}
                bearState={bearState}
                onStart={handleStartAnalysis}
                onResume={resumeCheckpoint}
                onReset={reset}
              />
            </Panel>
          </div>
```

Note: change `border-t` to `border-b` since it's now at the top instead of the bottom.

- [ ] **Step 2: Verify the dev server renders correctly**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-service && npm run build`
Expected: Build succeeds (may have type error from PhasePipeline — that's fixed in Task 4).

- [ ] **Step 3: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/app/ticker/\\[symbol\\]/page.tsx
git commit -m "feat: move AgentPanel to top of ticker detail page"
```

---

### Task 4: Frontend — Rewrite PhasePipeline as two-row split

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/components/detail/PhasePipeline.tsx`

- [ ] **Step 1: Rewrite PhasePipeline.tsx**

Replace the entire file with the two-row layout:

```tsx
"use client";

import type { AgentPhase } from "@/lib/agent-types";

type PhaseStatus = "pending" | "in_progress" | "complete" | "error" | "skipped";

interface PhasePipelineProps {
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
}

const DISCOVERY_PHASES: { key: AgentPhase; label: string }[] = [
  { key: "crawl_earnings", label: "EARN" },
  { key: "crawl_news", label: "NEWS" },
  { key: "crawl_podcasts", label: "POD" },
  { key: "crawl_cftc", label: "CFTC" },
];

const DISCOVERY_SEQ: { key: AgentPhase; label: string }[] = [
  { key: "chunk_embed", label: "CHUNK" },
  { key: "index", label: "INDEX" },
];

const TRADER_PHASES: { key: AgentPhase; label: string }[] = [
  { key: "signal_confirm", label: "SIGNAL" },
  { key: "vol_surface", label: "VOL" },
  { key: "narrative_sources", label: "NAR QUERY" },
  { key: "synthesis", label: "SYNTHESIS" },
  { key: "trade_rec", label: "TRADE REC" },
];

function statusClass(status: PhaseStatus): string {
  switch (status) {
    case "complete":
      return "border-bb-green text-bb-green bg-bb-green/10";
    case "in_progress":
      return "border-bb-amber text-bb-amber bg-bb-amber/10 animate-pulse";
    case "error":
      return "border-bb-red text-bb-red bg-bb-red/10";
    case "skipped":
      return "border-bb-gray/40 text-bb-gray/40";
    default:
      return "border-bb-gray text-bb-gray";
  }
}

function arrowClass(status: PhaseStatus): string {
  return status === "complete" ? "text-bb-green" : "text-bb-gray";
}

function Pill({ label, status }: { label: string; status: PhaseStatus }) {
  return (
    <div className={`px-2 py-0.5 border ${statusClass(status)}`}>
      {label}
    </div>
  );
}

function Arrow({ status }: { status: PhaseStatus }) {
  return <span className={`mx-0.5 ${arrowClass(status)}`}>→</span>;
}

function isDiscoverySkipped(
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">
): boolean {
  // Discovery is skipped if freshness_check is complete but all crawlers are still pending
  // while trader phases have started
  const freshDone = phases.get("freshness_check") === "complete";
  const allCrawlersPending = DISCOVERY_PHASES.every(
    (p) => phases.get(p.key) === "pending"
  );
  const traderStarted = TRADER_PHASES.some(
    (p) => phases.get(p.key) !== "pending"
  );
  return freshDone && allCrawlersPending && traderStarted;
}

export function PhasePipeline({ phases }: PhasePipelineProps) {
  const discoverySkipped = isDiscoverySkipped(phases);
  const freshStatus = phases.get("freshness_check") ?? "pending";

  return (
    <div className="flex flex-col gap-2 font-mono text-xs">
      {/* Row 1: Discovery */}
      <div>
        <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1">
          Discovery
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Pill label="FRESH" status={freshStatus} />
          <Arrow status={freshStatus} />

          {/* Parallel crawlers in a grouped box */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 border border-bb-gray/30 rounded-sm">
            {DISCOVERY_PHASES.map((p) => (
              <Pill
                key={p.key}
                label={p.label}
                status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
              />
            ))}
          </div>

          <Arrow
            status={
              discoverySkipped
                ? "skipped"
                : DISCOVERY_PHASES.every((p) => phases.get(p.key) === "complete")
                  ? "complete"
                  : "pending"
            }
          />

          {DISCOVERY_SEQ.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <Pill
                label={p.label}
                status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
              />
              {i < DISCOVERY_SEQ.length - 1 && (
                <Arrow
                  status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Trader */}
      <div>
        <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1">
          Trader
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {TRADER_PHASES.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <Pill label={p.label} status={phases.get(p.key) ?? "pending"} />
              {i < TRADER_PHASES.length - 1 && (
                <Arrow status={phases.get(p.key) ?? "pending"} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles and build succeeds**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-service && npx tsc --noEmit && npm run build`
Expected: No type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/components/detail/PhasePipeline.tsx
git commit -m "feat: rewrite PhasePipeline as two-row split with parallel crawlers"
```

---

### Task 5: Push backend and verify end-to-end

- [ ] **Step 1: Push the backend changes**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
git push origin main
```

Wait for ECS deployment to complete.

- [ ] **Step 2: Run a live analysis and verify new phase events appear**

Trigger an analysis via the frontend (or `vercel curl`) and check the poll response for the new phase names (`crawl_earnings`, `crawl_news`, etc.).

- [ ] **Step 3: Check ECS logs for clean startup**

```bash
aws logs tail /ecs/quant-agent-api --since 5m --format short | tail -20
```

Verify no `RuntimeWarning: coroutine was never awaited` errors (the Alembic thread fix from earlier should have resolved this).

- [ ] **Step 4: Push frontend and verify on Vercel**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git push origin main
```

Verify the deployed site shows: AgentPanel at top, two-row pipeline with Discovery and Trader rows.
