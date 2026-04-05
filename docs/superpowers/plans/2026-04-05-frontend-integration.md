# Plan 5: Frontend Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Next.js Bloomberg terminal frontend to the Python backend via SSE. Add scanner badges (CAT/NEWS/POS), an agent analysis panel with bear mascot on the ticker detail page, SSE streaming client, command line commands, and phase pipeline visualization.

**Architecture:** New `useAgentAnalysis` hook manages SSE connection lifecycle. New `AgentPanel` component renders progressive results. Scanner table gets source badges from backend polling. CommandLine extended with ANALYZE/CONTINUE/AUTO/SOURCES commands. Bear mascot is a CSS-animated SVG with state transitions.

**Tech Stack:** React 19, Next.js 16, SWR, EventSource API (native browser SSE), Tailwind CSS 4, existing Bloomberg component library

**Repo:** `~/Documents/Projects/quant-agent-service` (the frontend repo)

---

## File Structure

```
src/
├── hooks/
│   └── useAgentAnalysis.ts        # SSE hook for agent workflow
├── components/
│   ├── detail/
│   │   ├── AgentPanel.tsx         # Main agent analysis panel
│   │   ├── PhasePipeline.tsx      # Horizontal phase progress indicator
│   │   ├── TradeRecCards.tsx      # Trade recommendation cards
│   │   └── BearMascot.tsx         # Animated bear mascot SVG
│   └── scanner/
│       └── SourceBadges.tsx       # CAT/NEWS/POS badges for scanner rows
├── lib/
│   └── agent-types.ts             # TypeScript types for agent API
```

---

### Task 1: Agent API Types

**Files:**
- Create: `src/lib/agent-types.ts`

- [ ] **Step 1: Create the types file**

`src/lib/agent-types.ts`:
```typescript
// Backend API types for agent workflow

export interface ScannerSignals {
  iv_percentile: number;
  skew_kurtosis: number;
  dealer_gamma: number;
  term_structure: number;
  vanna: number;
  charm: number;
  composite: number;
}

export interface AnalyzeRequest {
  scanner_signals: ScannerSignals;
  auto_run?: boolean;
}

export interface JobResponse {
  job_id: string;
}

export interface SourceSummary {
  symbol: string;
  sources: {
    earnings: { last_updated: string | null; count: number };
    news: { last_updated: string | null; count: number };
    podcast: { last_updated: string | null; count: number };
    cftc: { last_updated: string | null; count: number };
  };
}

// SSE event types
export type AgentPhase =
  | "freshness_check"
  | "discovery"
  | "signal_confirm"
  | "vol_surface"
  | "narrative_sources"
  | "synthesis"
  | "trade_rec";

export interface PhaseEvent {
  phase: AgentPhase;
  status: "in_progress" | "complete";
  data?: Record<string, unknown>;
}

export interface CheckpointEvent {
  checkpoint: string;
  message: string;
}

export interface StreamEvent {
  phase: string;
  token: string;
}

export interface DoneEvent {
  job_id: string;
  total_time: number;
}

export interface ErrorEvent {
  phase?: string;
  error: string;
}

export type SSEEvent =
  | { type: "phase"; data: PhaseEvent }
  | { type: "checkpoint"; data: CheckpointEvent }
  | { type: "stream"; data: StreamEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: ErrorEvent };

export interface TradeRecommendation {
  strategy: string;
  direction: string;
  legs: Array<{
    action: string;
    expiry: string;
    strike: number;
    type: string;
  }>;
  rationale: string;
  estimated_greeks: { delta: number; vega: number; theta: number };
  risk_reward: string;
}

export type BearState = "idle" | "thinking" | "checkpoint" | "complete" | "error";

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
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Documents/Projects/quant-agent-service
npx tsc --noEmit src/lib/agent-types.ts 2>&1 || true
```

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/lib/agent-types.ts
git commit -m "feat: add TypeScript types for agent backend API"
```

---

### Task 2: SSE Hook (useAgentAnalysis)

**Files:**
- Create: `src/hooks/useAgentAnalysis.ts`

- [ ] **Step 1: Implement the SSE hook**

`src/hooks/useAgentAnalysis.ts`:
```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentAnalysisState,
  AgentPhase,
  AnalyzeRequest,
  BearState,
  CheckpointEvent,
  DoneEvent,
  ErrorEvent,
  JobResponse,
  PhaseEvent,
  StreamEvent,
  TradeRecommendation,
} from "@/lib/agent-types";

const BACKEND_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8000";

const INITIAL_PHASES: [AgentPhase, "pending"][] = [
  ["freshness_check", "pending"],
  ["discovery", "pending"],
  ["signal_confirm", "pending"],
  ["vol_surface", "pending"],
  ["narrative_sources", "pending"],
  ["synthesis", "pending"],
  ["trade_rec", "pending"],
];

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
  };
}

export function useAgentAnalysis() {
  const [state, setState] = useState<AgentAnalysisState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAnalysis = useCallback(
    async (symbol: string, request: AnalyzeRequest) => {
      // Reset state
      setState({ ...initialState(), status: "running" });

      try {
        // Kick off the analysis
        const resp = await fetch(`${BACKEND_URL}/analyze/${symbol}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!resp.ok) throw new Error(`Analysis request failed: ${resp.status}`);

        const { job_id }: JobResponse = await resp.json();
        setState((prev) => ({ ...prev, jobId: job_id }));

        // Open SSE connection
        const es = new EventSource(`${BACKEND_URL}/stream/${job_id}`);
        eventSourceRef.current = es;

        es.addEventListener("phase", (e) => {
          const data: PhaseEvent = JSON.parse(e.data);
          setState((prev) => {
            const phases = new Map(prev.phases);
            phases.set(data.phase, data.status === "complete" ? "complete" : "in_progress");
            return {
              ...prev,
              phases,
              volSurface:
                data.phase === "vol_surface" && data.data ? data.data : prev.volSurface,
            };
          });
        });

        es.addEventListener("checkpoint", (e) => {
          const data: CheckpointEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "checkpoint",
            checkpointMessage: data.message,
          }));
        });

        es.addEventListener("stream", (e) => {
          const data: StreamEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            narrativeTokens: prev.narrativeTokens + data.token,
          }));
        });

        es.addEventListener("done", (e) => {
          const data: DoneEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "complete",
            totalTime: data.total_time,
          }));
          es.close();
        });

        es.addEventListener("error", (e) => {
          // SSE spec: error events can be reconnection attempts or real errors
          if (e instanceof MessageEvent) {
            const data: ErrorEvent = JSON.parse(e.data);
            setState((prev) => ({
              ...prev,
              status: "error",
              error: data.error,
            }));
          }
          es.close();
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    []
  );

  const resumeCheckpoint = useCallback(async () => {
    const jobId = state.jobId;
    if (!jobId) return;

    setState((prev) => ({
      ...prev,
      status: "running",
      checkpointMessage: null,
    }));

    await fetch(`${BACKEND_URL}/stream/${jobId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "resume", user_input: { proceed: true } }),
    });
  }, [state.jobId]);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    setState(initialState());
  }, []);

  const bearState: BearState =
    state.status === "idle"
      ? "idle"
      : state.status === "running"
        ? "thinking"
        : state.status === "checkpoint"
          ? "checkpoint"
          : state.status === "complete"
            ? "complete"
            : "error";

  return {
    state,
    bearState,
    startAnalysis,
    resumeCheckpoint,
    reset,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/hooks/useAgentAnalysis.ts
git commit -m "feat: add useAgentAnalysis SSE hook for agent workflow"
```

---

### Task 3: Bear Mascot Component

**Files:**
- Create: `src/components/detail/BearMascot.tsx`

- [ ] **Step 1: Implement the bear mascot**

`src/components/detail/BearMascot.tsx`:
```tsx
"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

export function BearMascot({ state, size = 64 }: BearMascotProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${state === "thinking" ? "animate-bounce" : ""}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ears */}
          <circle cx="16" cy="12" r="10" fill="#333" />
          <circle cx="48" cy="12" r="10" fill="#333" />
          <circle cx="16" cy="12" r="6" fill="#555" />
          <circle cx="48" cy="12" r="6" fill="#555" />

          {/* Head */}
          <circle cx="32" cy="32" r="22" fill="#444" />

          {/* Eyes */}
          {state === "idle" ? (
            <>
              <circle cx="24" cy="28" r="3" fill="#4af6c3" />
              <circle cx="40" cy="28" r="3" fill="#4af6c3" />
            </>
          ) : state === "thinking" ? (
            <>
              {/* Squinting eyes */}
              <line x1="21" y1="28" x2="27" y2="28" stroke="#4af6c3" strokeWidth="2" />
              <line x1="37" y1="28" x2="43" y2="28" stroke="#4af6c3" strokeWidth="2" />
            </>
          ) : state === "checkpoint" ? (
            <>
              {/* Wide eyes looking at user */}
              <circle cx="24" cy="28" r="4" fill="#ffa500" />
              <circle cx="40" cy="28" r="4" fill="#ffa500" />
              <circle cx="24" cy="28" r="2" fill="#0a0a0a" />
              <circle cx="40" cy="28" r="2" fill="#0a0a0a" />
            </>
          ) : state === "complete" ? (
            <>
              {/* Happy closed eyes */}
              <path d="M21 27 Q24 24 27 27" stroke="#4af6c3" strokeWidth="2" fill="none" />
              <path d="M37 27 Q40 24 43 27" stroke="#4af6c3" strokeWidth="2" fill="none" />
            </>
          ) : (
            <>
              {/* Error: X eyes */}
              <line x1="21" y1="25" x2="27" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="27" y1="25" x2="21" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="37" y1="25" x2="43" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="43" y1="25" x2="37" y2="31" stroke="#ff433d" strokeWidth="2" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="32" cy="35" rx="4" ry="3" fill="#222" />

          {/* Mouth */}
          {state === "complete" ? (
            <path d="M26 40 Q32 46 38 40" stroke="#4af6c3" strokeWidth="1.5" fill="none" />
          ) : state === "error" ? (
            <path d="M26 44 Q32 38 38 44" stroke="#ff433d" strokeWidth="1.5" fill="none" />
          ) : (
            <line x1="28" y1="42" x2="36" y2="42" stroke="#999" strokeWidth="1.5" />
          )}
        </svg>

        {/* Thinking indicator */}
        {state === "thinking" && (
          <div className="absolute -top-2 -right-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bb-amber opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-bb-amber" />
            </span>
          </div>
        )}
      </div>

      <span className="text-xs text-bb-white font-mono">
        {state === "idle" && "READY"}
        {state === "thinking" && "ANALYZING..."}
        {state === "checkpoint" && "AWAITING INPUT"}
        {state === "complete" && "COMPLETE"}
        {state === "error" && "ERROR"}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/detail/BearMascot.tsx
git commit -m "feat: add animated bear mascot component"
```

---

### Task 4: Phase Pipeline Component

**Files:**
- Create: `src/components/detail/PhasePipeline.tsx`

- [ ] **Step 1: Implement the phase pipeline**

`src/components/detail/PhasePipeline.tsx`:
```tsx
"use client";

import type { AgentPhase } from "@/lib/agent-types";

interface PhasePipelineProps {
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
}

const PHASE_LABELS: Record<AgentPhase, string> = {
  freshness_check: "FRESH",
  discovery: "DISC",
  signal_confirm: "SIG",
  vol_surface: "VOL",
  narrative_sources: "NAR",
  synthesis: "SYN",
  trade_rec: "REC",
};

export function PhasePipeline({ phases }: PhasePipelineProps) {
  const entries = Array.from(phases.entries());

  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      {entries.map(([phase, status], i) => (
        <div key={phase} className="flex items-center">
          <div
            className={`px-2 py-0.5 border ${
              status === "complete"
                ? "border-bb-green text-bb-green bg-bb-green/10"
                : status === "in_progress"
                  ? "border-bb-amber text-bb-amber bg-bb-amber/10 animate-pulse"
                  : "border-bb-gray text-bb-gray"
            }`}
          >
            {PHASE_LABELS[phase]}
          </div>
          {i < entries.length - 1 && (
            <span
              className={`mx-0.5 ${
                status === "complete" ? "text-bb-green" : "text-bb-gray"
              }`}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/detail/PhasePipeline.tsx
git commit -m "feat: add phase pipeline progress indicator"
```

---

### Task 5: Trade Recommendation Cards

**Files:**
- Create: `src/components/detail/TradeRecCards.tsx`

- [ ] **Step 1: Implement the trade rec cards**

`src/components/detail/TradeRecCards.tsx`:
```tsx
"use client";

import type { TradeRecommendation } from "@/lib/agent-types";

interface TradeRecCardsProps {
  recs: TradeRecommendation[];
}

export function TradeRecCards({ recs }: TradeRecCardsProps) {
  if (recs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {recs.map((rec, i) => (
        <div
          key={i}
          className="border border-bb-gray bg-bb-darkgray p-3 font-mono text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-bb-amber font-bold uppercase">
              {rec.strategy.replace(/_/g, " ")}
            </span>
            <span
              className={`text-xs px-2 py-0.5 border ${
                rec.direction === "long_vol"
                  ? "border-bb-green text-bb-green"
                  : "border-bb-red text-bb-red"
              }`}
            >
              {rec.direction.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>

          {/* Legs */}
          <div className="mb-2">
            {rec.legs.map((leg, j) => (
              <div key={j} className="text-bb-white text-xs">
                <span
                  className={
                    leg.action === "buy" ? "text-bb-green" : "text-bb-red"
                  }
                >
                  {leg.action.toUpperCase()}
                </span>{" "}
                {leg.strike} {leg.type.toUpperCase()} {leg.expiry}
              </div>
            ))}
          </div>

          {/* Greeks */}
          <div className="flex gap-4 text-xs text-bb-white mb-2">
            <span>Δ {rec.estimated_greeks.delta?.toFixed(3)}</span>
            <span>V {rec.estimated_greeks.vega?.toFixed(2)}</span>
            <span>Θ {rec.estimated_greeks.theta?.toFixed(3)}</span>
          </div>

          {/* Rationale */}
          <div className="text-xs text-bb-white/70">{rec.rationale}</div>

          {/* Risk/Reward */}
          <div className="text-xs text-bb-amber mt-1">{rec.risk_reward}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/detail/TradeRecCards.tsx
git commit -m "feat: add trade recommendation cards component"
```

---

### Task 6: Agent Analysis Panel

**Files:**
- Create: `src/components/detail/AgentPanel.tsx`

- [ ] **Step 1: Implement the agent panel**

`src/components/detail/AgentPanel.tsx`:
```tsx
"use client";

import type { AgentAnalysisState, BearState } from "@/lib/agent-types";
import { BearMascot } from "./BearMascot";
import { PhasePipeline } from "./PhasePipeline";
import { TradeRecCards } from "./TradeRecCards";

interface AgentPanelProps {
  state: AgentAnalysisState;
  bearState: BearState;
  onStart: () => void;
  onResume: () => void;
  onReset: () => void;
}

export function AgentPanel({
  state,
  bearState,
  onStart,
  onResume,
  onReset,
}: AgentPanelProps) {
  return (
    <div className="border border-bb-gray bg-bb-black p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <BearMascot state={bearState} size={48} />
          <div>
            <h3 className="text-bb-amber text-sm font-bold">AGENT ANALYSIS</h3>
            {state.jobId && (
              <span className="text-bb-gray text-xs">{state.jobId}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {state.status === "idle" && (
            <button
              onClick={onStart}
              className="px-3 py-1 border border-bb-green text-bb-green text-xs hover:bg-bb-green/10 transition-colors"
            >
              RUN ANALYSIS [F5]
            </button>
          )}
          {state.status === "checkpoint" && (
            <button
              onClick={onResume}
              className="px-3 py-1 border border-bb-amber text-bb-amber text-xs hover:bg-bb-amber/10 animate-pulse transition-colors"
            >
              CONTINUE
            </button>
          )}
          {(state.status === "complete" || state.status === "error") && (
            <button
              onClick={onReset}
              className="px-3 py-1 border border-bb-gray text-bb-white text-xs hover:bg-bb-gray/10 transition-colors"
            >
              RESET
            </button>
          )}
        </div>
      </div>

      {/* Phase pipeline (show when running or complete) */}
      {state.status !== "idle" && (
        <div className="mb-3">
          <PhasePipeline phases={state.phases} />
        </div>
      )}

      {/* Checkpoint message */}
      {state.checkpointMessage && (
        <div className="border border-bb-amber bg-bb-amber/5 p-2 mb-3 text-xs text-bb-amber">
          ⏸ {state.checkpointMessage}
        </div>
      )}

      {/* Narrative stream */}
      {state.narrativeTokens && (
        <div className="mb-3">
          <div className="text-xs text-bb-gray mb-1">NARRATIVE</div>
          <div className="text-sm text-bb-brightwhite leading-relaxed bg-bb-darkgray p-3 border border-bb-gray max-h-48 overflow-y-auto">
            {state.narrativeTokens}
            {state.status === "running" && (
              <span className="animate-pulse text-bb-amber">▌</span>
            )}
          </div>
        </div>
      )}

      {/* Trade recommendations */}
      {state.tradeRecs.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-bb-gray mb-1">TRADE RECOMMENDATIONS</div>
          <TradeRecCards recs={state.tradeRecs} />
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="border border-bb-red bg-bb-red/5 p-2 text-xs text-bb-red">
          ERROR: {state.error}
        </div>
      )}

      {/* Completion */}
      {state.status === "complete" && state.totalTime && (
        <div className="text-xs text-bb-green">
          ✓ Analysis complete in {state.totalTime.toFixed(1)}s
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/detail/AgentPanel.tsx
git commit -m "feat: add agent analysis panel with progressive rendering"
```

---

### Task 7: Source Badges for Scanner

**Files:**
- Create: `src/components/scanner/SourceBadges.tsx`

- [ ] **Step 1: Implement source badges**

`src/components/scanner/SourceBadges.tsx`:
```tsx
"use client";

import type { SourceSummary } from "@/lib/agent-types";

interface SourceBadgesProps {
  sources: SourceSummary["sources"] | null;
}

export function SourceBadges({ sources }: SourceBadgesProps) {
  if (!sources) return null;

  const badges: Array<{ label: string; active: boolean; color: string }> = [];

  if (sources.earnings.count > 0) {
    badges.push({ label: "CAT", active: true, color: "text-bb-amber border-bb-amber" });
  }
  if (sources.news.count > 0) {
    badges.push({ label: "NEWS", active: true, color: "text-bb-blue border-bb-blue" });
  }
  if (sources.cftc.count > 0) {
    badges.push({ label: "POS", active: true, color: "text-bb-green border-bb-green" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`text-[10px] px-1 border font-mono ${b.color}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/components/scanner/SourceBadges.tsx
git commit -m "feat: add CAT/NEWS/POS source badges for scanner"
```

---

### Task 8: Integrate Agent Panel into Ticker Detail Page

**Files:**
- Modify: `src/app/ticker/[symbol]/page.tsx`

This task integrates the AgentPanel, useAgentAnalysis hook, and F5 keybinding into the existing ticker detail page.

- [ ] **Step 1: Read the current ticker detail page**

Read `src/app/ticker/[symbol]/page.tsx` to understand the current structure before modifying.

- [ ] **Step 2: Add imports and hook usage**

At the top of the component, add:
```typescript
import { useAgentAnalysis } from "@/hooks/useAgentAnalysis";
import { AgentPanel } from "@/components/detail/AgentPanel";
import type { ScannerSignals } from "@/lib/agent-types";
```

Inside the component function, add the hook:
```typescript
const { state: agentState, bearState, startAnalysis, resumeCheckpoint, reset } = useAgentAnalysis();
```

- [ ] **Step 3: Add the start handler that maps scanner scores to agent request**

```typescript
const handleStartAnalysis = useCallback(() => {
  if (!scanResult) return;
  const signals: ScannerSignals = {
    iv_percentile: scanResult.criteria.ivPercentile?.score ?? 0,
    skew_kurtosis: scanResult.criteria.skewKurtosis?.score ?? 0,
    dealer_gamma: scanResult.criteria.dealerGamma?.score ?? 0,
    term_structure: scanResult.criteria.termStructure?.score ?? 0,
    vanna: scanResult.criteria.vanna?.score ?? 0,
    charm: scanResult.criteria.charm?.score ?? 0,
    composite: scanResult.composite ?? 0,
  };
  startAnalysis(symbol, { scanner_signals: signals });
}, [scanResult, symbol, startAnalysis]);
```

- [ ] **Step 4: Add F5 keybinding**

In the existing keyboard event handler (or useEffect), add F5 handling:
```typescript
if (e.key === "F5") {
  e.preventDefault();
  handleStartAnalysis();
}
```

- [ ] **Step 5: Add AgentPanel below existing charts**

After the existing chart panels, add:
```tsx
{/* Agent Analysis */}
<AgentPanel
  state={agentState}
  bearState={bearState}
  onStart={handleStartAnalysis}
  onResume={resumeCheckpoint}
  onReset={reset}
/>
```

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
git add src/app/ticker/[symbol]/page.tsx
git commit -m "feat: integrate agent analysis panel into ticker detail page"
```

---

### Task 9: Add Backend URL Environment Variable

**Files:**
- Modify: `.env.example` or create `.env.local`

- [ ] **Step 1: Add env variable**

Create or update `.env.local`:
```
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8000
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-service
echo "NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8000" >> .env.example 2>/dev/null || true
git add .env.example
git commit -m "feat: add backend URL environment variable"
```

---

### Task 10: Verification

- [ ] **Step 1: Verify TypeScript compiles**

```bash
cd ~/Documents/Projects/quant-agent-service
npx tsc --noEmit
```

- [ ] **Step 2: Verify dev server starts**

```bash
cd ~/Documents/Projects/quant-agent-service
npm run dev &
sleep 5
curl -s http://localhost:3000 | head -20
kill %1
```

- [ ] **Step 3: Verify git log**

```bash
cd ~/Documents/Projects/quant-agent-service
git log --oneline | head -15
```
