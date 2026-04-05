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

const MACRO_LINES: Record<string, { color: string; label: string }> = {
  SPY: { color: "#4af6c3", label: "SPY" },
  USO: { color: "#ff433d", label: "USO" },
  UNG: { color: "#0068ff", label: "UNG" },
  GLD: { color: "#ff9900", label: "GLD" },
  ITA: { color: "#cc66ff", label: "ITA" },
  FXI: { color: "#66cccc", label: "FXI" },
};

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

function getForwardIVProjection(
  chain: OptionsChainData,
  spotPrice: number,
  historicalVols: number[]
): Array<{ date: string; percentile: number }> {
  const result: Array<{ date: string; percentile: number }> = [];
  for (const [expStr, { calls }] of Object.entries(chain.chains)) {
    if (calls.length === 0) continue;
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

const MARGIN = { top: 15, right: 50, bottom: 25, left: 45 };
const CHART_W = 700;
const CHART_H = 180;
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

  const tickerPct = normalizeToPctChange(tickerHistory);
  const ivSeries = computeIVPercentileSeries(tickerHistory);

  const prices = tickerHistory.map((b) => b.close);
  const historicalVols = rollingRealizedVol(prices, 30);

  const forwardIV =
    chain && spotPrice > 0
      ? getForwardIVProjection(chain, spotPrice, historicalVols)
      : [];

  const macroLines = Object.entries(MACRO_LINES)
    .filter(([sym]) => macroData[sym]?.length > 0)
    .map(([sym, meta]) => ({
      label: meta.label,
      color: meta.color,
      points: normalizeToPctChange(macroData[sym]),
    }));

  const vixBars = macroData["^VIX"] ?? [];
  const vixPoints = vixBars.map((b) => ({ date: b.date, value: b.close }));

  const allDates = tickerPct.map((p) => p.date);
  if (allDates.length === 0) {
    return (
      <div className="text-bb-white/40 text-[11px]">
        Need historical data for chart
      </div>
    );
  }

  const dateToX = (date: string): number => {
    const idx = allDates.indexOf(date);
    if (idx === -1) return -1;
    return MARGIN.left + (idx / (allDates.length - 1)) * INNER_W;
  };

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

  const rightToY = (v: number) =>
    MARGIN.top + ((100 - v) / 100) * INNER_H;

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
  const ivLine = toPolyline(
    ivSeries.map((p) => ({ date: p.date, value: p.percentile })),
    rightToY
  );
  const vixLine = toPolyline(vixPoints, rightToY);

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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * totalWidth;
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

  function getValueAt(
    points: Array<{ date: string; value: number }>,
    idx: number
  ): number | null {
    const date = allDates[idx];
    const pt = points.find((p) => p.date === date);
    return pt?.value ?? null;
  }

  const monthLabels: Array<{ x: number; label: string }> = [];
  let lastMonth = "";
  for (let i = 0; i < allDates.length; i++) {
    const d = new Date(allDates[i]);
    const month = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    if (month !== lastMonth) {
      monthLabels.push({ x: dateToX(allDates[i]), label: month });
      lastMonth = month;
    }
  }

  const leftTicks: number[] = [];
  const leftStep = Math.ceil(leftRange / 5 / 10) * 10 || 10;
  for (
    let v = Math.ceil(leftMin / leftStep) * leftStep;
    v <= leftMax;
    v += leftStep
  ) {
    leftTicks.push(v);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 flex-wrap text-[10px]">
        <span className="text-bb-orange font-bold text-[12px] border border-bb-orange px-1">
          ━ {tickerSymbol}
        </span>
        <span className="text-bb-brightwhite font-bold text-[12px] border border-white px-1">
          ━ IV %ile
        </span>
        {macroLines.map((ml) => (
          <span key={ml.label} style={{ color: ml.color, opacity: 0.6 }}>
            ── {ml.label}
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
        {leftTicks.map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} y1={leftToY(v)} x2={MARGIN.left + INNER_W} y2={leftToY(v)} stroke="#1a1a1a" strokeWidth={1} />
            <text x={MARGIN.left - 4} y={leftToY(v) + 3} fill="#666" fontSize="9" textAnchor="end">
              {v > 0 ? "+" : ""}{v}%
            </text>
          </g>
        ))}

        {[0, 20, 40, 60, 80, 100].map((v) => (
          <text key={v} x={MARGIN.left + INNER_W + 4} y={rightToY(v) + 3} fill="#666" fontSize="9">{v}</text>
        ))}

        {monthLabels.map((ml, i) => (
          <text key={i} x={ml.x} y={CHART_H - 5} fill="#666" fontSize="9">{ml.label}</text>
        ))}

        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + INNER_H} stroke="#333" />
        <line x1={MARGIN.left + INNER_W} y1={MARGIN.top} x2={MARGIN.left + INNER_W} y2={MARGIN.top + INNER_H} stroke="#333" />
        <line x1={MARGIN.left} y1={MARGIN.top + INNER_H} x2={MARGIN.left + INNER_W} y2={MARGIN.top + INNER_H} stroke="#333" />

        <line x1={MARGIN.left} y1={leftToY(0)} x2={MARGIN.left + INNER_W} y2={leftToY(0)} stroke="#333" strokeDasharray="4,4" />

        {macroLines.map((line) => (
          <polyline key={line.label} points={toPolyline(line.points, leftToY)} fill="none" stroke={line.color} strokeWidth={1} opacity={0.35} />
        ))}

        {vixLine && (
          <polyline points={vixLine} fill="none" stroke="#ff433d" strokeWidth={1} strokeDasharray="6,3" opacity={0.4} />
        )}

        <polyline points={tickerLine} fill="none" stroke="#fb8b1e" strokeWidth={6} opacity={0.15} />
        <polyline points={tickerLine} fill="none" stroke="#fb8b1e" strokeWidth={3} />

        <polyline points={ivLine} fill="none" stroke="#ffffff" strokeWidth={7} opacity={0.1} />
        <polyline points={ivLine} fill="none" stroke="#ffffff" strokeWidth={3} />

        <line x1={lastDateX} y1={MARGIN.top} x2={lastDateX} y2={MARGIN.top + INNER_H} stroke="#444" strokeDasharray="4,3" />
        <text x={lastDateX} y={CHART_H - 5} fill="#fb8b1e" fontSize="9" textAnchor="middle" fontWeight="bold">TODAY</text>

        {forwardPoints.length > 0 && (
          <>
            <rect x={lastDateX} y={MARGIN.top} width={totalWidth - lastDateX} height={INNER_H} fill="#fb8b1e" opacity={0.04} />
            {ivSeries.length > 0 && (
              <polyline
                points={`${lastDateX},${rightToY(ivSeries[ivSeries.length - 1].percentile)} ${forwardPoints.map((fp) => `${fp.x},${fp.y}`).join(" ")}`}
                fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="3,3"
              />
            )}
            {forwardPoints.map((fp, i) => (
              <g key={i}>
                <circle cx={fp.x} cy={fp.y} r={5} fill="#ffffff" stroke="#fb8b1e" strokeWidth={2} />
                <text x={fp.x} y={fp.y - 8} fill="#fff" fontSize="8" textAnchor="middle">{fp.percentile}</text>
              </g>
            ))}
          </>
        )}

        {hoverIndex !== null && (
          <>
            <line x1={dateToX(allDates[hoverIndex])} y1={MARGIN.top} x2={dateToX(allDates[hoverIndex])} y2={MARGIN.top + INNER_H} stroke="#fb8b1e" strokeWidth={0.5} opacity={0.6} />
            {(() => {
              const tx = dateToX(allDates[hoverIndex]);
              const tooltipX = tx > CHART_W / 2 ? tx - 145 : tx + 10;
              const tickerVal = getValueAt(tickerPct, hoverIndex);
              const ivVal = getValueAt(ivSeries.map((p) => ({ date: p.date, value: p.percentile })), hoverIndex);
              const vixVal = getValueAt(vixPoints, hoverIndex);
              return (
                <g>
                  <rect x={tooltipX} y={MARGIN.top} width={135} height={115} fill="#111" stroke="#333" />
                  <text x={tooltipX + 6} y={MARGIN.top + 14} fill="#fb8b1e" fontSize="9" fontWeight="bold">{allDates[hoverIndex]}</text>
                  <text x={tooltipX + 6} y={MARGIN.top + 28} fill="#fb8b1e" fontSize="9">
                    {tickerSymbol}: {tickerVal !== null ? `${tickerVal >= 0 ? "+" : ""}${tickerVal.toFixed(1)}%` : "—"}
                  </text>
                  {macroLines.slice(0, 4).map((ml, i) => {
                    const val = getValueAt(ml.points, hoverIndex);
                    return (
                      <text key={ml.label} x={tooltipX + 6} y={MARGIN.top + 42 + i * 12} fill={ml.color} fontSize="8" opacity={0.7}>
                        {ml.label}: {val !== null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                      </text>
                    );
                  })}
                  <text x={tooltipX + 6} y={MARGIN.top + 95} fill="#fff" fontSize="9" fontWeight="bold">
                    IV %ile: {ivVal !== null ? ivVal.toFixed(0) : "—"}
                  </text>
                  <text x={tooltipX + 6} y={MARGIN.top + 108} fill="#ff433d" fontSize="8">
                    VIX: {vixVal !== null ? vixVal.toFixed(1) : "—"}
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
