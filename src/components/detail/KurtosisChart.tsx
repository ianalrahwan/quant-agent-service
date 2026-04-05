"use client";

import type { HistoricalBar } from "@/lib/types";

interface KurtosisChartProps {
  history: HistoricalBar[];
}

function computeReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[]): number {
  const avg = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1));
}

function excessKurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const avg = mean(values);
  const s = std(values);
  if (s === 0) return 0;
  const m4 = values.reduce((sum, v) => sum + ((v - avg) / s) ** 4, 0) / values.length;
  return m4 - 3;
}

function skewness(values: number[]): number {
  if (values.length < 3) return 0;
  const avg = mean(values);
  const s = std(values);
  if (s === 0) return 0;
  return values.reduce((sum, v) => sum + ((v - avg) / s) ** 3, 0) / values.length;
}

/**
 * Build a histogram of returns.
 */
function buildHistogram(
  values: number[],
  bins: number
): Array<{ center: number; count: number }> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.01;
  const binWidth = range / bins;

  const histogram = Array.from({ length: bins }, (_, i) => ({
    center: min + (i + 0.5) * binWidth,
    count: 0,
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
    histogram[idx].count++;
  }

  return histogram;
}

/**
 * Normal PDF for overlay.
 */
function normalPdf(x: number, mu: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

export function KurtosisChart({ history }: KurtosisChartProps) {
  if (history.length < 30) {
    return <div className="text-bb-white/40 text-[11px]">Need 30+ days of history</div>;
  }

  const prices = history.map((b) => b.close);
  const returns = computeReturns(prices);
  if (returns.length < 20) {
    return <div className="text-bb-white/40 text-[11px]">Insufficient return data</div>;
  }

  const mu = mean(returns);
  const sigma = std(returns);
  const kurt = excessKurtosis(returns);
  const skew = skewness(returns);

  const bins = 40;
  const histogram = buildHistogram(returns, bins);
  const maxCount = Math.max(...histogram.map((h) => h.count));

  const chartW = 400;
  const chartH = 180;
  const barWidth = chartW / bins - 1;

  // Normal distribution overlay points
  const normalPoints: Array<[number, number]> = [];
  const minR = Math.min(...returns);
  const maxR = Math.max(...returns);
  const rangeR = maxR - minR || 0.01;
  const binWidth = rangeR / bins;
  // Scale normal PDF to match histogram
  const normalScale = returns.length * binWidth;

  for (let i = 0; i <= 80; i++) {
    const x = minR + (i / 80) * rangeR;
    const pdfVal = normalPdf(x, mu, sigma) * normalScale;
    const px = ((x - minR) / rangeR) * chartW;
    const py = chartH - (pdfVal / maxCount) * chartH * 0.9;
    normalPoints.push([px, py]);
  }

  // Highlight tail regions (beyond 2 sigma)
  const leftTail = mu - 2 * sigma;
  const rightTail = mu + 2 * sigma;

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-[12px]">
        <span className="text-bb-white">
          Kurtosis: <span className={kurt > 1 ? "text-bb-green font-bold" : "text-bb-white font-bold"}>
            {kurt.toFixed(2)}
          </span>
          {kurt > 3 ? " (very fat tails)" : kurt > 1 ? " (fat tails)" : kurt > 0 ? " (mild)" : " (thin tails)"}
        </span>
        <span className="text-bb-white">
          Skew: <span className={skew < -0.3 ? "text-bb-red font-bold" : "text-bb-white font-bold"}>
            {skew.toFixed(2)}
          </span>
          {skew < -0.5 ? " (left heavy)" : skew < -0.2 ? " (slight left)" : " (symmetric)"}
        </span>
      </div>

      <div className="text-[11px] text-bb-white/60 mb-1">
        Return Distribution (60d) vs Normal &mdash;{" "}
        <span className="text-bb-amber">bars</span> = actual,{" "}
        <span className="text-bb-blue">curve</span> = normal
      </div>

      <svg width={chartW} height={chartH + 25} className="font-mono">
        {/* Histogram bars */}
        {histogram.map((bin, i) => {
          const barH = (bin.count / maxCount) * chartH * 0.9;
          const x = i * (chartW / bins);
          const y = chartH - barH;
          const isTail = bin.center < leftTail || bin.center > rightTail;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={Math.max(barWidth, 2)}
              height={barH}
              fill={isTail ? (bin.count > 0 ? "#ff433d" : "#fb8b1e") : "#fb8b1e"}
              opacity={isTail ? 0.9 : 0.5}
            />
          );
        })}

        {/* Normal distribution overlay */}
        <polyline
          points={normalPoints.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#0068ff"
          strokeWidth="2"
          strokeDasharray="4,3"
        />

        {/* Zero line */}
        {(() => {
          const zeroX = ((0 - minR) / rangeR) * chartW;
          return (
            <>
              <line x1={zeroX} y1={0} x2={zeroX} y2={chartH} stroke="#333" strokeDasharray="3,3" />
              <text x={zeroX} y={chartH + 14} textAnchor="middle" fill="#666" fontSize="10">0%</text>
            </>
          );
        })()}

        {/* Tail markers */}
        {(() => {
          const leftX = ((leftTail - minR) / rangeR) * chartW;
          const rightX = ((rightTail - minR) / rangeR) * chartW;
          return (
            <>
              <line x1={leftX} y1={0} x2={leftX} y2={chartH} stroke="#ff433d" strokeDasharray="2,2" opacity={0.5} />
              <line x1={rightX} y1={0} x2={rightX} y2={chartH} stroke="#ff433d" strokeDasharray="2,2" opacity={0.5} />
              <text x={leftX} y={chartH + 14} textAnchor="middle" fill="#ff433d" fontSize="9">-2&sigma;</text>
              <text x={rightX} y={chartH + 14} textAnchor="middle" fill="#ff433d" fontSize="9">+2&sigma;</text>
            </>
          );
        })()}

        {/* Axis labels */}
        <text x={0} y={chartH + 22} fill="#666" fontSize="9">
          {(minR * 100).toFixed(1)}%
        </text>
        <text x={chartW} y={chartH + 22} textAnchor="end" fill="#666" fontSize="9">
          {(maxR * 100).toFixed(1)}%
        </text>
      </svg>

      <div className="mt-2 text-[10px] text-bb-white/40">
        <span className="text-bb-red">Red bars</span> = returns beyond 2&sigma; (tail events).
        {kurt > 1
          ? " More tail events than normal distribution predicts — Black-Scholes underprices this risk."
          : " Tail events roughly match normal distribution."}
      </div>
    </div>
  );
}
