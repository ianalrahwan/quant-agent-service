# Macro Overlay & IV Percentile Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dual-axis multi-line time series chart to the ticker detail page showing macro proxy prices, IV percentile history, VIX, and forward IV projection from options chain.

**Architecture:** Pure SVG chart component (`MacroIVChart.tsx`) fed by a new `/api/macro` route that batches historical data for 7 macro symbols plus VIX. A new `iv-percentile-series.ts` utility computes rolling IV percentile from existing historical price data. The detail page layout changes from 2 rows to 3 rows on the right side to accommodate the chart.

**Tech Stack:** React, SVG, SWR, existing yahoo-finance2 data layer, Tailwind CSS with Bloomberg color tokens.

---

### Task 1: IV Percentile Series Utility

**Files:**
- Create: `src/lib/math/iv-percentile-series.ts`

- [ ] **Step 1: Create the utility**

This function computes a rolling IV percentile time series. For each trading day with enough history, it computes 30-day trailing realized vol, then ranks it against the trailing 252-day vol distribution.

```typescript
// src/lib/math/iv-percentile-series.ts
import { rollingRealizedVol } from "./volatility";
import { percentile } from "./statistics";
import type { HistoricalBar } from "../types";

export interface IVPercentilePoint {
  date: string;
  percentile: number; // 0-100
}

/**
 * Compute a rolling IV percentile time series from historical prices.
 * For each day, ranks the current 30-day realized vol against the
 * trailing 252-day distribution of realized vol values.
 *
 * Returns points starting from day 252 onward (need enough lookback).
 */
export function computeIVPercentileSeries(
  history: HistoricalBar[]
): IVPercentilePoint[] {
  const prices = history.map((b) => b.close);
  const vols = rollingRealizedVol(prices, 30);

  // vols[i] corresponds to history[i + 30] (30-day lookback offset)
  // We need 252 vol values as lookback for percentile ranking
  const lookback = 252;
  const result: IVPercentilePoint[] = [];

  for (let i = lookback; i < vols.length; i++) {
    const currentVol = vols[i];
    const historicalWindow = vols.slice(i - lookback, i);
    const pctl = percentile(currentVol, historicalWindow);
    // Map history index: vols[i] corresponds to history[i + 30]
    const historyIndex = i + 30;
    if (historyIndex < history.length) {
      result.push({
        date: history[historyIndex].date,
        percentile: Math.round(pctl * 100),
      });
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/math/iv-percentile-series.ts 2>&1 || npx next build 2>&1 | tail -5`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/math/iv-percentile-series.ts
git commit -m "feat: add rolling IV percentile series utility"
```

---

### Task 2: Macro API Route

**Files:**
- Create: `src/app/api/macro/route.ts`

- [ ] **Step 1: Create the API route**

This route fetches 1-year historical prices for the fixed macro basket plus VIX. It reuses the existing `getHistoricalPrices` function from `yahoo.ts`.

```typescript
// src/app/api/macro/route.ts
import { NextResponse } from "next/server";
import { getHistoricalPrices } from "@/lib/yahoo";
import { cacheGet, cacheSet, TTL } from "@/lib/cache";
import type { HistoricalBar } from "@/lib/types";

const MACRO_SYMBOLS = ["USO", "UNG", "GLD", "ITA", "FXI", "SPY", "^VIX"];

export async function GET() {
  const cacheKey = "macro:basket";
  const cached = cacheGet<Record<string, HistoricalBar[]>>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
    });
  }

  const results: Record<string, HistoricalBar[]> = {};

  // Fetch all symbols in parallel
  const entries = await Promise.all(
    MACRO_SYMBOLS.map(async (sym) => {
      try {
        const bars = await getHistoricalPrices(sym);
        return [sym, bars] as const;
      } catch {
        return [sym, []] as const;
      }
    })
  );

  for (const [sym, bars] of entries) {
    if (bars.length > 0) {
      results[sym] = bars;
    }
  }

  cacheSet(cacheKey, results, TTL.HISTORICAL);

  return NextResponse.json(results, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
  });
}
```

- [ ] **Step 2: Verify route builds**

Run: `npx next build 2>&1 | tail -15`

Expected: Route `/api/macro` appears in the build output as `ƒ` (dynamic).

- [ ] **Step 3: Test the route**

Start dev server and test:

Run: `curl -s http://localhost:3000/api/macro | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(Object.keys(j));console.log('USO bars:',j.USO?.length)"`

Expected: Array of symbol keys, USO bars count ~252.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/macro/route.ts
git commit -m "feat: add macro basket API route"
```

---

### Task 3: MacroIVChart Component

**Files:**
- Create: `src/components/detail/MacroIVChart.tsx`

This is the main chart component. It's the largest task. The component:
- Takes ticker history, macro basket data, VIX history, and options chain
- Normalizes price lines to % change
- Computes IV percentile series from ticker history
- Computes forward IV projection from options chain
- Renders dual-axis SVG with hover crosshair

- [ ] **Step 1: Create the chart component**

```typescript
// src/components/detail/MacroIVChart.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import type { HistoricalBar, OptionsChainData } from "@/lib/types";
import { computeIVPercentileSeries } from "@/lib/math/iv-percentile-series";
import { rollingRealizedVol } from "@/lib/math/volatility";
import { percentile } from "@/lib/math/statistics";

interface MacroIVChartProps {
  tickerSymbol: string;
  tickerHistory: HistoricalBar[];
  macroData: Record<string, HistoricalBar[]>;
  chain: OptionsChainData | null;
  spotPrice: number;
}

interface LineSeries {
  label: string;
  color: string;
  opacity: number;
  strokeWidth: number;
  dashed: boolean;
  hero: boolean;
  axis: "left" | "right";
  points: Array<{ date: string; value: number }>;
}

// Macro line colors
const MACRO_LINES: Record<string, { color: string; label: string }> = {
  SPY: { color: "#4af6c3", label: "SPY" },
  USO: { color: "#ff433d", label: "USO" },
  UNG: { color: "#0068ff", label: "UNG" },
  GLD: { color: "#ff9900", label: "GLD" },
  ITA: { color: "#cc66ff", label: "ITA" },
  FXI: { color: "#66cccc", label: "FXI" },
};

/**
 * Normalize a price series to % change from first value.
 */
function normalizeToPctChange(
  bars: HistoricalBar[]
): Array<{ date: string; value: number }> {
  if (bars.length === 0) return [];
  const base = bars[0].close;
  if (base <= 0) return [];
  return bars.map((b) => ({
    date: b.date,
    value: ((b.close - base) / base) * 100,
  }));
}

/**
 * Get ATM IV for each expiration date to build forward projection.
 */
function getForwardIVProjection(
  chain: OptionsChainData,
  spotPrice: number,
  historicalVols: number[]
): Array<{ date: string; percentile: number }> {
  const result: Array<{ date: string; percentile: number }> = [];
  for (const [expStr, { calls }] of Object.entries(chain.chains)) {
    if (calls.length === 0) continue;
    // Find ATM call
    let closest = calls[0];
    let minDist = Math.abs(calls[0].strike - spotPrice);
    for (const c of calls) {
      const dist = Math.abs(c.strike - spotPrice);
      if (dist < minDist) {
        minDist = dist;
        closest = c;
      }
    }
    if (closest.impliedVolatility > 0 && historicalVols.length > 0) {
      const pctl = percentile(closest.impliedVolatility, historicalVols);
      result.push({ date: expStr, percentile: Math.round(pctl * 100) });
    }
  }
  return result;
}

// Chart dimensions
const MARGIN = { top: 20, right: 55, bottom: 30, left: 50 };
const CHART_W = 700;
const CHART_H = 250;
const INNER_W = CHART_W - MARGIN.left - MARGIN.right;
const INNER_H = CHART_H - MARGIN.top - MARGIN.bottom;

export function MacroIVChart({
  tickerSymbol,
  tickerHistory,
  macroData,
  chain,
  spotPrice,
}: MacroIVChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Build all series
  const tickerPct = normalizeToPctChange(tickerHistory);
  const ivSeries = computeIVPercentileSeries(tickerHistory);

  // Historical vols for forward projection percentile ranking
  const prices = tickerHistory.map((b) => b.close);
  const historicalVols = rollingRealizedVol(prices, 30);

  // Forward projection from options chain
  const forwardIV =
    chain && spotPrice > 0
      ? getForwardIVProjection(chain, spotPrice, historicalVols)
      : [];

  // Macro lines
  const macroLines: LineSeries[] = Object.entries(MACRO_LINES)
    .filter(([sym]) => macroData[sym]?.length > 0)
    .map(([sym, meta]) => ({
      label: meta.label,
      color: meta.color,
      opacity: 0.35,
      strokeWidth: 1,
      dashed: false,
      hero: false,
      axis: "left" as const,
      points: normalizeToPctChange(macroData[sym]),
    }));

  // VIX line (right axis, raw values, dashed)
  const vixBars = macroData["^VIX"] ?? [];
  const vixPoints = vixBars.map((b) => ({ date: b.date, value: b.close }));

  // Collect all dates for x-axis
  const allDates = tickerPct.map((p) => p.date);
  if (allDates.length === 0) {
    return (
      <div className="text-bb-white/40 text-[11px]">
        Need historical data for chart
      </div>
    );
  }

  // Date to x-position mapping
  const dateToX = (date: string): number => {
    const idx = allDates.indexOf(date);
    if (idx === -1) return -1;
    return MARGIN.left + (idx / (allDates.length - 1)) * INNER_W;
  };

  // Left axis: % change range
  const allLeftValues = [
    ...tickerPct.map((p) => p.value),
    ...macroLines.flatMap((l) =>
      l.points.filter((p) => allDates.includes(p.date)).map((p) => p.value)
    ),
  ];
  const leftMin = Math.min(0, ...allLeftValues) * 1.1;
  const leftMax = Math.max(0, ...allLeftValues) * 1.1;
  const leftRange = leftMax - leftMin || 1;
  const leftToY = (v: number) =>
    MARGIN.top + ((leftMax - v) / leftRange) * INNER_H;

  // Right axis: 0-100 for IV percentile, VIX typically 10-80
  const rightMin = 0;
  const rightMax = 100;
  const rightRange = rightMax - rightMin;
  const rightToY = (v: number) =>
    MARGIN.top + ((rightMax - v) / rightRange) * INNER_H;

  // Build polyline strings
  function toPolyline(
    points: Array<{ date: string; value: number }>,
    toY: (v: number) => number
  ): string {
    return points
      .map((p) => {
        const x = dateToX(p.date);
        if (x < 0) return null;
        return `${x},${toY(p.value)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  const tickerLine = toPolyline(tickerPct, leftToY);
  const ivLine = toPolyline(ivSeries, rightToY);
  const vixLine = toPolyline(vixPoints, rightToY);

  // Forward projection x positions (right of last historical date)
  const lastDateX = MARGIN.left + INNER_W;
  const forwardPoints = forwardIV.map((fp, i) => ({
    x: lastDateX + (i + 1) * 12,
    y: rightToY(fp.percentile),
    date: fp.date,
    percentile: fp.percentile,
  }));
  const totalWidth = forwardPoints.length > 0
    ? forwardPoints[forwardPoints.length - 1].x + 15
    : CHART_W;

  // Hover handling
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgX =
        ((e.clientX - rect.left) / rect.width) * totalWidth;
      const dataX = svgX - MARGIN.left;
      const idx = Math.round((dataX / INNER_W) * (allDates.length - 1));
      if (idx >= 0 && idx < allDates.length) {
        setHoverIndex(idx);
      } else {
        setHoverIndex(null);
      }
    },
    [allDates.length, totalWidth]
  );

  // Get value at hover index for a series
  function getValueAt(
    points: Array<{ date: string; value: number }>,
    idx: number
  ): number | null {
    const date = allDates[idx];
    const pt = points.find((p) => p.date === date);
    return pt?.value ?? null;
  }

  // X-axis month labels
  const monthLabels: Array<{ x: number; label: string }> = [];
  let lastMonth = "";
  for (let i = 0; i < allDates.length; i++) {
    const d = new Date(allDates[i]);
    const month = d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    if (month !== lastMonth) {
      monthLabels.push({ x: dateToX(allDates[i]), label: month });
      lastMonth = month;
    }
  }

  // Left axis grid lines
  const leftTicks: number[] = [];
  const leftStep = Math.ceil(leftRange / 5 / 10) * 10;
  for (
    let v = Math.ceil(leftMin / leftStep) * leftStep;
    v <= leftMax;
    v += leftStep
  ) {
    leftTicks.push(v);
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 flex-wrap text-[10px]">
        <span className="text-bb-orange font-bold text-[12px] border border-bb-orange px-1">
          ━ {tickerSymbol}
        </span>
        <span className="text-bb-brightwhite font-bold text-[12px] border border-white px-1">
          ━ IV %ile
        </span>
        {Object.entries(MACRO_LINES)
          .filter(([sym]) => macroData[sym]?.length > 0)
          .map(([sym, meta]) => (
            <span key={sym} style={{ color: meta.color, opacity: 0.6 }}>
              ── {meta.label}
            </span>
          ))}
        <span style={{ color: "#ff433d", opacity: 0.6 }}>┈┈ VIX</span>
        <span className="text-bb-white text-[10px]">○ Fwd IV</span>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${totalWidth} ${CHART_H}`}
        className="font-mono"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Grid lines */}
        {leftTicks.map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              y1={leftToY(v)}
              x2={MARGIN.left + INNER_W}
              y2={leftToY(v)}
              stroke="#1a1a1a"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 4}
              y={leftToY(v) + 3}
              fill="#666"
              fontSize="9"
              textAnchor="end"
            >
              {v > 0 ? "+" : ""}
              {v}%
            </text>
          </g>
        ))}

        {/* Right axis labels */}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <text
            key={v}
            x={MARGIN.left + INNER_W + 4}
            y={rightToY(v) + 3}
            fill="#666"
            fontSize="9"
          >
            {v}
          </text>
        ))}

        {/* X-axis month labels */}
        {monthLabels.map((ml, i) => (
          <text
            key={i}
            x={ml.x}
            y={CHART_H - 5}
            fill="#666"
            fontSize="9"
          >
            {ml.label}
          </text>
        ))}

        {/* Axes */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={MARGIN.top + INNER_H}
          stroke="#333"
        />
        <line
          x1={MARGIN.left + INNER_W}
          y1={MARGIN.top}
          x2={MARGIN.left + INNER_W}
          y2={MARGIN.top + INNER_H}
          stroke="#333"
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + INNER_H}
          x2={MARGIN.left + INNER_W}
          y2={MARGIN.top + INNER_H}
          stroke="#333"
        />

        {/* Zero line */}
        <line
          x1={MARGIN.left}
          y1={leftToY(0)}
          x2={MARGIN.left + INNER_W}
          y2={leftToY(0)}
          stroke="#333"
          strokeDasharray="4,4"
        />

        {/* Background macro lines */}
        {macroLines.map((line) => (
          <polyline
            key={line.label}
            points={toPolyline(line.points, leftToY)}
            fill="none"
            stroke={line.color}
            strokeWidth={1}
            opacity={0.35}
          />
        ))}

        {/* VIX (dashed, subdued, right axis) */}
        {vixLine && (
          <polyline
            points={vixLine}
            fill="none"
            stroke="#ff433d"
            strokeWidth={1}
            strokeDasharray="6,3"
            opacity={0.4}
          />
        )}

        {/* Hero: Ticker price GLOW */}
        <polyline
          points={tickerLine}
          fill="none"
          stroke="#fb8b1e"
          strokeWidth={6}
          opacity={0.15}
        />
        {/* Hero: Ticker price */}
        <polyline
          points={tickerLine}
          fill="none"
          stroke="#fb8b1e"
          strokeWidth={3}
        />

        {/* Hero: IV Percentile GLOW */}
        <polyline
          points={ivLine}
          fill="none"
          stroke="#ffffff"
          strokeWidth={7}
          opacity={0.1}
        />
        {/* Hero: IV Percentile */}
        <polyline
          points={ivLine}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
        />

        {/* TODAY marker */}
        <line
          x1={lastDateX}
          y1={MARGIN.top}
          x2={lastDateX}
          y2={MARGIN.top + INNER_H}
          stroke="#444"
          strokeDasharray="4,3"
        />
        <text
          x={lastDateX}
          y={CHART_H - 5}
          fill="#fb8b1e"
          fontSize="9"
          textAnchor="middle"
          fontWeight="bold"
        >
          TODAY
        </text>

        {/* Forward projection zone */}
        {forwardPoints.length > 0 && (
          <>
            <rect
              x={lastDateX}
              y={MARGIN.top}
              width={totalWidth - lastDateX}
              height={INNER_H}
              fill="#fb8b1e"
              opacity={0.04}
            />
            {/* Connect last IV point to first forward point */}
            {ivSeries.length > 0 && (
              <polyline
                points={`${lastDateX},${rightToY(ivSeries[ivSeries.length - 1].percentile)} ${forwardPoints.map((fp) => `${fp.x},${fp.y}`).join(" ")}`}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeDasharray="3,3"
              />
            )}
            {/* Forward dots */}
            {forwardPoints.map((fp, i) => (
              <g key={i}>
                <circle
                  cx={fp.x}
                  cy={fp.y}
                  r={5}
                  fill="#ffffff"
                  stroke="#fb8b1e"
                  strokeWidth={2}
                />
                <text
                  x={fp.x}
                  y={fp.y - 8}
                  fill="#fff"
                  fontSize="8"
                  textAnchor="middle"
                >
                  {fp.percentile}
                </text>
              </g>
            ))}
          </>
        )}

        {/* Hover crosshair */}
        {hoverIndex !== null && (
          <>
            <line
              x1={dateToX(allDates[hoverIndex])}
              y1={MARGIN.top}
              x2={dateToX(allDates[hoverIndex])}
              y2={MARGIN.top + INNER_H}
              stroke="#fb8b1e"
              strokeWidth={0.5}
              opacity={0.6}
            />
            {/* Tooltip */}
            {(() => {
              const tx = dateToX(allDates[hoverIndex]);
              const tooltipX = tx > CHART_W / 2 ? tx - 145 : tx + 10;
              const tickerVal = getValueAt(tickerPct, hoverIndex);
              const ivVal = getValueAt(
                ivSeries.map((p) => ({
                  date: p.date,
                  value: p.percentile,
                })),
                hoverIndex
              );
              const vixVal = getValueAt(vixPoints, hoverIndex);
              return (
                <g>
                  <rect
                    x={tooltipX}
                    y={MARGIN.top}
                    width={135}
                    height={115}
                    fill="#111"
                    stroke="#333"
                  />
                  <text
                    x={tooltipX + 6}
                    y={MARGIN.top + 14}
                    fill="#fb8b1e"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    {allDates[hoverIndex]}
                  </text>
                  <text
                    x={tooltipX + 6}
                    y={MARGIN.top + 28}
                    fill="#fb8b1e"
                    fontSize="9"
                  >
                    {tickerSymbol}:{" "}
                    {tickerVal !== null
                      ? `${tickerVal >= 0 ? "+" : ""}${tickerVal.toFixed(1)}%`
                      : "—"}
                  </text>
                  {Object.entries(MACRO_LINES)
                    .filter(([sym]) => macroData[sym]?.length > 0)
                    .slice(0, 4)
                    .map(([sym, meta], i) => {
                      const val = getValueAt(
                        normalizeToPctChange(macroData[sym]),
                        hoverIndex
                      );
                      return (
                        <text
                          key={sym}
                          x={tooltipX + 6}
                          y={MARGIN.top + 42 + i * 12}
                          fill={meta.color}
                          fontSize="8"
                          opacity={0.7}
                        >
                          {meta.label}:{" "}
                          {val !== null
                            ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`
                            : "—"}
                        </text>
                      );
                    })}
                  <text
                    x={tooltipX + 6}
                    y={MARGIN.top + 95}
                    fill="#fff"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    IV %ile:{" "}
                    {ivVal !== null ? ivVal.toFixed(0) : "—"}
                  </text>
                  <text
                    x={tooltipX + 6}
                    y={MARGIN.top + 108}
                    fill="#ff433d"
                    fontSize="8"
                  >
                    VIX:{" "}
                    {vixVal !== null ? vixVal.toFixed(1) : "—"}
                  </text>
                </g>
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx next build 2>&1 | tail -5`

Expected: Build succeeds (component isn't imported yet, but should have no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/MacroIVChart.tsx
git commit -m "feat: add MacroIVChart component with dual-axis SVG"
```

---

### Task 4: Integrate Chart into Detail Page

**Files:**
- Modify: `src/app/ticker/[symbol]/page.tsx`

- [ ] **Step 1: Update the detail page**

Add the macro data SWR fetch and restructure the right-side grid to 3 rows with the chart on top.

Changes to `src/app/ticker/[symbol]/page.tsx`:

1. Add import for `MacroIVChart`:
```typescript
import { MacroIVChart } from "@/components/detail/MacroIVChart";
```

2. Add SWR fetch for macro data (after existing SWR hooks, around line 39):
```typescript
const { data: macroData } = useSWR<Record<string, HistoricalBar[]>>(
  "/api/macro",
  fetcher,
  { revalidateOnFocus: false }
);
```

3. Replace the right-side grid (lines 134-203) with a 3-row layout. The new structure:
```tsx
{/* Right: Visualizations */}
<div className="flex-1 flex flex-col overflow-hidden">
  {/* Top row: Macro IV Chart (taller) */}
  <div className="border-b border-bb-gray overflow-auto" style={{ minHeight: "280px" }}>
    <Panel title={
      <>
        <span>Macro Overlay & IV Percentile</span>
        <InfoTooltip
          quote="You want to see how the vol regime of your ticker relates to what's happening in the broader macro landscape. When commodities spike on geopolitical risk and your ticker's IV percentile is still low, that's a dislocation — the market hasn't priced the contagion yet."
        />
      </>
    }>
      {history && history.length > 0 ? (
        <MacroIVChart
          tickerSymbol={symbol}
          tickerHistory={history}
          macroData={macroData ?? {}}
          chain={chain ?? null}
          spotPrice={spotPrice}
        />
      ) : (
        <div className="text-bb-white/40 text-[11px] animate-pulse">
          Loading chart data...
        </div>
      )}
    </Panel>
  </div>

  {/* Middle row: Term Structure + Skew */}
  <div className="flex flex-1 min-h-0">
    {/* ... existing Term Structure and IV Skew panels unchanged ... */}
  </div>

  {/* Bottom row: Kurtosis + Vol Surface */}
  <div className="flex flex-1 min-h-0">
    {/* ... existing Kurtosis and Vol Surface panels unchanged ... */}
  </div>
</div>
```

The middle and bottom rows remain exactly as they are now. Only the top of the right column changes — insert the MacroIVChart panel above the existing 2x2 grid.

- [ ] **Step 2: Verify it builds and renders**

Run: `npx next build 2>&1 | tail -5`

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Manual smoke test**

Start dev server, navigate to a ticker (e.g., `/ticker/RIVN`), verify:
- Chart renders with ticker line (orange, thick) and IV percentile (white, thick)
- Macro lines appear as thin, subdued lines
- Forward projection dots appear right of the TODAY marker
- Hovering shows crosshair and tooltip

- [ ] **Step 4: Commit**

```bash
git add src/app/ticker/\\[symbol\\]/page.tsx
git commit -m "feat: integrate MacroIVChart into ticker detail page"
```

---

### Task 5: Final Build Verification

- [ ] **Step 1: Full build**

Run: `npx next build 2>&1 | tail -15`

Expected: All routes build successfully, no warnings.

- [ ] **Step 2: Commit all remaining changes**

If any files were missed:

```bash
git add -A
git status
git commit -m "chore: macro IV chart cleanup"
```
