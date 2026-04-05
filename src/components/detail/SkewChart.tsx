"use client";

import type { OptionContract } from "@/lib/types";

interface SkewChartProps {
  calls: OptionContract[];
  puts: OptionContract[];
  spotPrice: number;
}

export function SkewChart({ calls, puts, spotPrice }: SkewChartProps) {
  // Combine and filter for strikes within 20% of spot
  const minStrike = spotPrice * 0.8;
  const maxStrike = spotPrice * 1.2;

  const filteredCalls = calls.filter(
    (c) => c.strike >= minStrike && c.strike <= maxStrike && c.impliedVolatility > 0
  );
  const filteredPuts = puts.filter(
    (p) => p.strike >= minStrike && p.strike <= maxStrike && p.impliedVolatility > 0
  );

  if (filteredCalls.length === 0 && filteredPuts.length === 0) {
    return <div className="text-bb-gray text-[11px]">No skew data available</div>;
  }

  const allIVs = [...filteredCalls, ...filteredPuts].map((o) => o.impliedVolatility);
  const allStrikes = [...filteredCalls, ...filteredPuts].map((o) => o.strike);
  const maxIV = Math.max(...allIVs);
  const minIV = Math.min(...allIVs);
  const ivRange = maxIV - minIV || 0.01;
  const strikeMin = Math.min(...allStrikes);
  const strikeMax = Math.max(...allStrikes);
  const strikeRange = strikeMax - strikeMin || 1;

  const chartW = 400;
  const chartH = 200;

  function toPoint(strike: number, iv: number): [number, number] {
    const x = ((strike - strikeMin) / strikeRange) * chartW;
    const y = chartH - ((iv - minIV) / ivRange) * chartH * 0.85 - chartH * 0.05;
    return [x, y];
  }

  const callPoints = filteredCalls
    .sort((a, b) => a.strike - b.strike)
    .map((c) => toPoint(c.strike, c.impliedVolatility));

  const putPoints = filteredPuts
    .sort((a, b) => a.strike - b.strike)
    .map((p) => toPoint(p.strike, p.impliedVolatility));

  const spotX = ((spotPrice - strikeMin) / strikeRange) * chartW;

  return (
    <div>
      <div className="text-[12px] text-bb-white mb-1">
        IV by Strike — <span className="text-bb-green font-bold">Calls</span> /{" "}
        <span className="text-bb-red font-bold">Puts</span>
      </div>
      <svg width={chartW} height={chartH + 25} className="font-mono">
        {/* Spot line */}
        <line
          x1={spotX}
          y1={0}
          x2={spotX}
          y2={chartH}
          stroke="#fb8b1e"
          strokeDasharray="4,4"
        />
        <text x={spotX} y={chartH + 16} textAnchor="middle" fill="#fb8b1e" fontSize="12" fontWeight="bold">
          ATM
        </text>

        {/* Call IV curve */}
        {callPoints.length > 1 && (
          <polyline
            points={callPoints.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#4af6c3"
            strokeWidth="2"
          />
        )}

        {/* Put IV curve */}
        {putPoints.length > 1 && (
          <polyline
            points={putPoints.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#ff433d"
            strokeWidth="2"
          />
        )}

        {/* Axis labels */}
        <text x={0} y={chartH + 16} fill="#cccccc" fontSize="11">
          {strikeMin.toFixed(0)}
        </text>
        <text x={chartW} y={chartH + 16} textAnchor="end" fill="#cccccc" fontSize="11">
          {strikeMax.toFixed(0)}
        </text>
      </svg>
    </div>
  );
}
