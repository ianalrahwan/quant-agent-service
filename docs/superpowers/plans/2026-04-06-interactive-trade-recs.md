# Interactive Trade Rec Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trade recommendation cards clickable with inline-expand showing interactive payoff chart, live pricing from options chain, and date slider for P&L at different points before expiry.

**Architecture:** Pure frontend — no backend changes. TradeRecCards gets accordion behavior, each card expands to show TradeRecDetail (pricing + rationale) and PayoffChart (SVG payoff curve with date slider). Black-Scholes pricing function enables the date slider interpolation. Chain data flows from the page through AgentPanel to TradeRecCards.

**Tech Stack:** React, TypeScript, custom SVG charts (following existing pattern — no Recharts), Tailwind CSS with Bloomberg theme tokens (`bb-*`).

**Note:** The spec mentions Recharts but the codebase uses custom SVG for all charts. This plan follows the existing SVG pattern.

---

### Task 1: Black-Scholes pricing utility

**Files:**
- Create: `src/lib/black-scholes.ts`

- [ ] **Step 1: Create the Black-Scholes pricing module**

```typescript
/**
 * Black-Scholes option pricing for payoff chart date slider.
 * Used to calculate theoretical option prices at any point between now and expiry.
 */

const RISK_FREE_RATE = 0.05;

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

/** Black-Scholes price for a European option. */
export function bsPrice(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  type: "call" | "put"
): number {
  if (dte <= 0) {
    // At expiry — intrinsic value
    return type === "call"
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
  }

  const t = dte / 365;
  const d1 =
    (Math.log(spot / strike) + (RISK_FREE_RATE + (iv * iv) / 2) * t) /
    (iv * Math.sqrt(t));
  const d2 = d1 - iv * Math.sqrt(t);
  const discount = Math.exp(-RISK_FREE_RATE * t);

  if (type === "call") {
    return spot * normCdf(d1) - strike * discount * normCdf(d2);
  }
  return strike * discount * normCdf(-d2) - spot * normCdf(-d1);
}

/** Calculate P&L for a single leg at a given spot and DTE. */
export function legPnl(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  type: "call" | "put",
  action: "buy" | "sell",
  entryPrice: number
): number {
  const currentPrice = bsPrice(spot, strike, dte, iv, type);
  const pnl = currentPrice - entryPrice;
  return action === "buy" ? pnl : -pnl;
}

/**
 * Calculate total structure P&L across all legs for a range of spot prices.
 * Returns array of { spot, pnl } points for charting.
 */
export function structurePayoff(
  legs: Array<{
    strike: number;
    iv: number;
    type: "call" | "put";
    action: "buy" | "sell";
    entryPrice: number;
  }>,
  spotPrice: number,
  dte: number,
  numPoints?: number
): Array<{ spot: number; pnl: number }> {
  const points = numPoints ?? 80;
  const minSpot = spotPrice * 0.85;
  const maxSpot = spotPrice * 1.15;
  const step = (maxSpot - minSpot) / points;
  const result: Array<{ spot: number; pnl: number }> = [];

  for (let s = minSpot; s <= maxSpot; s += step) {
    let totalPnl = 0;
    for (const leg of legs) {
      totalPnl += legPnl(s, leg.strike, dte, leg.iv, leg.type, leg.action, leg.entryPrice);
    }
    result.push({ spot: Number(s.toFixed(2)), pnl: Number((totalPnl * 100).toFixed(2)) });
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (new file, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/black-scholes.ts
git commit -m "feat: add Black-Scholes pricing utility for payoff charts

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: TradeRecDetail component (pricing row + rationale)

**Files:**
- Create: `src/components/detail/TradeRecDetail.tsx`

- [ ] **Step 1: Create the TradeRecDetail component**

This component renders the expanded detail section: live pricing for each leg, summary metrics (net debit, max loss, max profit, breakevens), and full rationale.

```tsx
"use client";

import type { TradeRecommendation } from "@/lib/agent-types";
import type { OptionsChainData, OptionContract } from "@/lib/types";

interface MatchedLeg {
  action: string;
  strike: number;
  type: string;
  expiry: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  iv: number | null;
  estimated: boolean;
}

interface TradeRecDetailProps {
  rec: TradeRecommendation;
  chain: OptionsChainData | null;
  spotPrice: number;
}

function findContract(
  chain: OptionsChainData,
  strike: number,
  expiry: string,
  type: string
): OptionContract | null {
  // Find closest expiry in chain
  const expirations = Object.keys(chain.chains);
  if (expirations.length === 0) return null;

  let bestExpiry = expirations[0];
  let bestDiff = Math.abs(new Date(expirations[0]).getTime() - new Date(expiry).getTime());
  for (const exp of expirations) {
    const diff = Math.abs(new Date(exp).getTime() - new Date(expiry).getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestExpiry = exp;
    }
  }

  const expiryChain = chain.chains[bestExpiry];
  if (!expiryChain) return null;

  const contracts = type === "call" ? expiryChain.calls : expiryChain.puts;
  return contracts.find((c) => c.strike === strike) ?? null;
}

export function matchLegs(
  rec: TradeRecommendation,
  chain: OptionsChainData | null
): MatchedLeg[] {
  return rec.legs.map((leg) => {
    if (!chain) {
      return {
        action: leg.action,
        strike: leg.strike,
        type: leg.type,
        expiry: leg.expiry,
        bid: null,
        ask: null,
        mid: null,
        iv: null,
        estimated: true,
      };
    }

    const contract = findContract(chain, leg.strike, leg.expiry, leg.type);
    if (!contract) {
      return {
        action: leg.action,
        strike: leg.strike,
        type: leg.type,
        expiry: leg.expiry,
        bid: null,
        ask: null,
        mid: null,
        iv: null,
        estimated: true,
      };
    }

    return {
      action: leg.action,
      strike: leg.strike,
      type: leg.type,
      expiry: leg.expiry,
      bid: contract.bid,
      ask: contract.ask,
      mid: (contract.bid + contract.ask) / 2,
      iv: contract.impliedVolatility,
      estimated: false,
    };
  });
}

function calcNetDebit(legs: MatchedLeg[]): number | null {
  if (legs.some((l) => l.mid === null)) return null;
  let net = 0;
  for (const leg of legs) {
    net += leg.action === "buy" ? -(leg.mid!) : leg.mid!;
  }
  return net;
}

export function TradeRecDetail({ rec, chain, spotPrice }: TradeRecDetailProps) {
  const legs = matchLegs(rec, chain);
  const netDebit = calcNetDebit(legs);
  const hasEstimated = legs.some((l) => l.estimated);

  return (
    <div className="border-t border-bb-gray/30 pt-3 mt-2">
      {/* Pricing row */}
      <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-2">
        Live Pricing{hasEstimated && <span className="text-bb-amber ml-1">(EST)</span>}
      </div>
      <div className="flex flex-col gap-1 mb-3">
        {legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div>
              <span className={leg.action === "buy" ? "text-bb-green" : "text-bb-red"}>
                {leg.action.toUpperCase()}
              </span>{" "}
              <span className="text-bb-white">
                {leg.strike} {leg.type.toUpperCase()} {leg.expiry}
              </span>
            </div>
            <div className="flex gap-3 text-bb-white/70">
              {leg.estimated ? (
                <span className="text-bb-amber text-[10px]">EST</span>
              ) : (
                <>
                  <span>B: {leg.bid!.toFixed(2)}</span>
                  <span>A: {leg.ask!.toFixed(2)}</span>
                  <span className="text-bb-white">M: {leg.mid!.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary metrics */}
      {netDebit !== null && (
        <div className="flex gap-4 text-xs mb-3">
          <div>
            <div className="text-bb-gray/60 text-[9px] uppercase">Net {netDebit < 0 ? "Debit" : "Credit"}</div>
            <div className="text-bb-amber">${Math.abs(netDebit).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-bb-gray/60 text-[9px] uppercase">Max Loss</div>
            <div className="text-bb-red">-${(Math.abs(netDebit) * 100).toFixed(0)}</div>
          </div>
        </div>
      )}

      {/* Rationale */}
      <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1 mt-3">
        Rationale
      </div>
      <div className="text-xs text-bb-white/80 leading-relaxed">{rec.rationale}</div>

      {/* Risk/Reward */}
      <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1 mt-2">
        Risk / Reward
      </div>
      <div className="text-xs text-bb-amber leading-relaxed">{rec.risk_reward}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/TradeRecDetail.tsx
git commit -m "feat: add TradeRecDetail component with live pricing and rationale

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PayoffChart component (SVG payoff curve with date slider)

**Files:**
- Create: `src/components/detail/PayoffChart.tsx`

- [ ] **Step 1: Create the PayoffChart component**

Custom SVG chart following the same pattern as SkewChart — `toPoint()` coordinate transforms, Bloomberg theme colors, no external charting library.

```tsx
"use client";

import { useState } from "react";
import { structurePayoff } from "@/lib/black-scholes";
import type { MatchedLeg } from "./TradeRecDetail";

interface PayoffChartProps {
  legs: MatchedLeg[];
  spotPrice: number;
  maxDte: number; // days to furthest expiry
}

export function PayoffChart({ legs, spotPrice, maxDte }: PayoffChartProps) {
  const [dte, setDte] = useState(maxDte);

  // Build leg inputs for structurePayoff
  const payoffLegs = legs
    .filter((l) => l.mid !== null && l.iv !== null)
    .map((l) => ({
      strike: l.strike,
      iv: l.iv!,
      type: l.type as "call" | "put",
      action: l.action as "buy" | "sell",
      entryPrice: l.mid!,
    }));

  if (payoffLegs.length === 0) {
    return (
      <div className="text-bb-gray text-[11px]">
        Cannot render payoff — no pricing data available
      </div>
    );
  }

  const data = structurePayoff(payoffLegs, spotPrice, dte);

  const chartW = 400;
  const chartH = 160;
  const padL = 45;
  const padR = 10;
  const padT = 10;
  const padB = 25;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const spots = data.map((d) => d.spot);
  const pnls = data.map((d) => d.pnl);
  const minSpot = Math.min(...spots);
  const maxSpot = Math.max(...spots);
  const minPnl = Math.min(...pnls, 0);
  const maxPnl = Math.max(...pnls, 0);
  const spotRange = maxSpot - minSpot || 1;
  const pnlRange = maxPnl - minPnl || 1;

  function toX(spot: number): number {
    return padL + ((spot - minSpot) / spotRange) * innerW;
  }

  function toY(pnl: number): number {
    return padT + innerH - ((pnl - minPnl) / pnlRange) * innerH;
  }

  const points = data.map((d) => `${toX(d.spot)},${toY(d.pnl)}`).join(" ");
  const zeroY = toY(0);
  const spotX = toX(spotPrice);

  return (
    <div>
      <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1">
        Payoff{" "}
        <span className="text-bb-white normal-case tracking-normal">
          ({dte === 0 ? "at expiry" : `${dte}d to expiry`})
        </span>
      </div>

      <svg width={chartW} height={chartH} className="font-mono">
        {/* Zero line */}
        <line
          x1={padL}
          y1={zeroY}
          x2={chartW - padR}
          y2={zeroY}
          stroke="#333"
          strokeWidth="1"
        />

        {/* Spot reference line */}
        <line
          x1={spotX}
          y1={padT}
          x2={spotX}
          y2={chartH - padB}
          stroke="#fb8b1e"
          strokeDasharray="4,4"
          strokeWidth="1"
        />
        <text
          x={spotX}
          y={chartH - padB + 14}
          textAnchor="middle"
          fill="#fb8b1e"
          fontSize="10"
        >
          SPOT
        </text>

        {/* P&L curve */}
        <polyline
          points={points}
          fill="none"
          stroke="#4af6c3"
          strokeWidth="2"
        />

        {/* Fill profit area */}
        {data.map((d, i) => {
          if (i === 0 || d.pnl <= 0) return null;
          const prev = data[i - 1];
          if (prev.pnl <= 0) return null;
          return (
            <line
              key={i}
              x1={toX(d.spot)}
              y1={toY(d.pnl)}
              x2={toX(d.spot)}
              y2={zeroY}
              stroke="#4af6c3"
              strokeWidth="1"
              opacity="0.08"
            />
          );
        })}

        {/* Y-axis labels */}
        <text x={padL - 4} y={toY(maxPnl) + 4} textAnchor="end" fill="#888" fontSize="9">
          ${maxPnl.toFixed(0)}
        </text>
        <text x={padL - 4} y={toY(minPnl) + 4} textAnchor="end" fill="#888" fontSize="9">
          ${minPnl.toFixed(0)}
        </text>
        <text x={padL - 4} y={zeroY + 4} textAnchor="end" fill="#555" fontSize="9">
          $0
        </text>

        {/* X-axis labels */}
        <text x={padL} y={chartH - padB + 14} fill="#888" fontSize="9">
          {minSpot.toFixed(0)}
        </text>
        <text
          x={chartW - padR}
          y={chartH - padB + 14}
          textAnchor="end"
          fill="#888"
          fontSize="9"
        >
          {maxSpot.toFixed(0)}
        </text>
      </svg>

      {/* Date slider */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-bb-gray/60 text-[10px]">EXPIRY</span>
        <input
          type="range"
          min={0}
          max={maxDte}
          value={dte}
          onChange={(e) => setDte(Number(e.target.value))}
          className="flex-1 h-1 accent-bb-amber"
        />
        <span className="text-bb-gray/60 text-[10px]">NOW</span>
      </div>
    </div>
  );
}
```

**Note:** The `MatchedLeg` type needs to be exported from `TradeRecDetail.tsx`. Update the interface in Task 2's file to add `export` to the `MatchedLeg` interface declaration (change `interface MatchedLeg` to `export interface MatchedLeg`).

- [ ] **Step 2: Export MatchedLeg from TradeRecDetail.tsx**

In `src/components/detail/TradeRecDetail.tsx`, change line with `interface MatchedLeg {` to `export interface MatchedLeg {`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/PayoffChart.tsx src/components/detail/TradeRecDetail.tsx
git commit -m "feat: add PayoffChart with SVG payoff curve and date slider

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire up TradeRecCards with accordion expand

**Files:**
- Modify: `src/components/detail/TradeRecCards.tsx`

- [ ] **Step 1: Rewrite TradeRecCards with click-to-expand accordion**

```tsx
"use client";

import { useState } from "react";
import type { TradeRecommendation } from "@/lib/agent-types";
import type { OptionsChainData } from "@/lib/types";
import { TradeRecDetail, matchLegs } from "./TradeRecDetail";
import { PayoffChart } from "./PayoffChart";

interface TradeRecCardsProps {
  recs: TradeRecommendation[];
  chain: OptionsChainData | null;
  spotPrice: number;
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

export function TradeRecCards({ recs, chain, spotPrice }: TradeRecCardsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (recs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {recs.map((rec, i) => {
        const isExpanded = expandedIdx === i;
        const legs = isExpanded ? matchLegs(rec, chain) : [];
        const maxDte = isExpanded
          ? Math.max(...rec.legs.map((l) => daysUntil(l.expiry)), 1)
          : 0;

        return (
          <div
            key={i}
            className={`border bg-bb-darkgray p-3 font-mono text-sm cursor-pointer transition-colors ${
              isExpanded ? "border-bb-amber" : "border-bb-gray hover:border-bb-amber/50"
            }`}
            onClick={() => setExpandedIdx(isExpanded ? null : i)}
          >
            {/* Collapsed summary (always visible) */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-bb-amber font-bold uppercase">
                {rec.strategy.replace(/_/g, " ")}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 border ${
                    rec.direction === "long_vol"
                      ? "border-bb-green text-bb-green"
                      : "border-bb-red text-bb-red"
                  }`}
                >
                  {rec.direction.replace(/_/g, " ").toUpperCase()}
                </span>
                <span className="text-bb-gray text-xs">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Legs summary */}
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

            {/* Collapsed rationale (short) */}
            {!isExpanded && (
              <div className="text-xs text-bb-white/70 truncate">{rec.rationale}</div>
            )}

            {/* Expanded detail */}
            {isExpanded && (
              <div onClick={(e) => e.stopPropagation()}>
                <PayoffChart legs={legs} spotPrice={spotPrice} maxDte={maxDte} />
                <TradeRecDetail rec={rec} chain={chain} spotPrice={spotPrice} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Type error — AgentPanel doesn't pass `chain` and `spotPrice` to TradeRecCards yet. That's fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/TradeRecCards.tsx
git commit -m "feat: add accordion expand to TradeRecCards with payoff chart and detail

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Thread chain data through AgentPanel

**Files:**
- Modify: `src/components/detail/AgentPanel.tsx`
- Modify: `src/app/ticker/[symbol]/page.tsx`

- [ ] **Step 1: Update AgentPanel to accept and pass chain data**

In `src/components/detail/AgentPanel.tsx`, add `chain` and `spotPrice` to the props interface and pass them to `TradeRecCards`:

Add to imports:
```tsx
import type { OptionsChainData } from "@/lib/types";
```

Update the interface (add after `onReset: () => void;`):
```tsx
  chain: OptionsChainData | null;
  spotPrice: number;
```

Update the destructured props to include `chain` and `spotPrice`.

Update the TradeRecCards usage (around line 120):
```tsx
<TradeRecCards recs={state.tradeRecs} chain={chain} spotPrice={spotPrice} />
```

- [ ] **Step 2: Pass chain and spotPrice from page.tsx to AgentPanel**

In `src/app/ticker/[symbol]/page.tsx`, update the AgentPanel usage (around line 179):

```tsx
<AgentPanel
  state={agentState}
  bearState={bearState}
  onStart={handleStartAnalysis}
  onResume={resumeCheckpoint}
  onReset={reset}
  chain={chain ?? null}
  spotPrice={spotPrice}
/>
```

- [ ] **Step 3: Verify TypeScript compiles and build succeeds**

Run: `npx tsc --noEmit && npm run build`
Expected: No type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/AgentPanel.tsx "src/app/ticker/[symbol]/page.tsx"
git commit -m "feat: thread chain data through AgentPanel to TradeRecCards

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
