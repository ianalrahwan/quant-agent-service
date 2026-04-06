# Agent Pipeline Expansion Design

## Goal

Move the agent analysis panel to the top of the ticker detail page (above visualizations) and expand the pipeline to show the actual backend graph structure, including parallel discovery crawlers rendered as a two-row split.

## Layout Change

The AgentPanel moves from last in the right column to first, above Term Structure/IV Skew. Always expanded — no collapse behavior.

```
Signal  │  Agent Analysis (TOP)
Summary │  - Two-row pipeline
        │  - Logs, narrative, trade recs
        ├────────────────────────────────
        │  Term Structure  │  IV Skew
        │  Kurtosis        │  Vol Surface
        │  Macro IV Chart
```

**File:** `src/app/ticker/[symbol]/page.tsx` — reorder AgentPanel above chart panels.

## New Backend Phase Events

The discovery sub-graph currently emits a single `discovery:complete` event. Change `run_discovery` to stream the sub-graph with `astream()` (same pattern as `run_trader`) and emit per-node phase events as each completes.

New phase events emitted from discovery:
- `crawl_earnings` — complete or error
- `crawl_news` — complete or error
- `crawl_podcasts` — complete or error
- `crawl_cftc` — complete or error
- `chunk_embed` — complete
- `index` — complete

These use the existing `PhaseEvent` type. No new event types needed.

**File:** `graphs/orchestrator/nodes/run_discovery.py` — stream sub-graph, emit per-node phase events.

## Frontend Phase Model

Extend `AgentPhase` union type to replace the single `"discovery"` phase with granular sub-phases:

```typescript
type AgentPhase =
  // Orchestrator
  | "freshness_check"
  // Discovery (parallel crawlers + sequential processing)
  | "crawl_earnings" | "crawl_news" | "crawl_podcasts" | "crawl_cftc"
  | "chunk_embed" | "index"
  // Trader (sequential)
  | "signal_confirm" | "vol_surface" | "narrative_sources"
  | "synthesis" | "trade_rec";
```

Data model stays as a flat `Map<AgentPhase, Status>`. Visual grouping is handled by the pipeline component, not the data model.

**Files:**
- `src/lib/agent-types.ts` — extend `AgentPhase` union
- `src/hooks/useAgentAnalysis.ts` — update `INITIAL_PHASES` with new entries

## Two-Row Pipeline Component

Replace `PhasePipeline.tsx` with a two-row layout reflecting the actual backend graph:

**Row 1 — Discovery:**
```
FRESH → [ EARN | NEWS | POD | CFTC ] → CHUNK → INDEX
```

The 4 crawlers are grouped in a bordered box to show fan-out/fan-in parallelism. Each crawler pill gets independent status.

**Row 2 — Trader:**
```
SIGNAL → VOL → NAR QUERY → SYNTHESIS → TRADE REC
```

Standard horizontal sequential flow.

**Row labels:** Small uppercase text ("DISCOVERY" / "TRADER") above each row, matching Bloomberg terminal aesthetic.

**Status styling:**
- `complete` — green background (`#1a3a1a` bg, `#4ade80` text)
- `in_progress` — amber with pulse animation
- `pending` — dark gray
- `error` — red (new, for crawlers that fail)

**Discovery skipped:** If freshness check determines `discovery_needed: false`, discovery row phases show as "skipped" (dimmed) and trader row starts immediately.

**File:** `src/components/detail/PhasePipeline.tsx` — rewrite with two-row layout.

## Summary of Changes

### Backend (quant-agent-backend)
1. `graphs/orchestrator/nodes/run_discovery.py` — stream sub-graph, emit per-crawler phase events

### Frontend (quant-agent-service)
1. `src/app/ticker/[symbol]/page.tsx` — move AgentPanel to top of right column
2. `src/lib/agent-types.ts` — extend AgentPhase union with discovery sub-phases
3. `src/hooks/useAgentAnalysis.ts` — update INITIAL_PHASES with new phase entries
4. `src/components/detail/PhasePipeline.tsx` — rewrite as two-row split layout
