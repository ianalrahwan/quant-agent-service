"use client";

import type { VixTermStructure } from "@/lib/types";

interface TermStructureProps {
  vixData: VixTermStructure | null;
  nearIV?: number;
  farIV?: number;
}

export function TermStructureChart({ vixData, nearIV, farIV }: TermStructureProps) {
  // Use VIX term structure if available, else individual ticker near/far
  const points = vixData
    ? [
        { label: "9D", value: vixData.vix9d },
        { label: "1M", value: vixData.vix },
        { label: "3M", value: vixData.vix3m },
        { label: "6M", value: vixData.vix6m },
        { label: "1Y", value: vixData.vix1y },
      ]
    : nearIV && farIV
      ? [
          { label: "Near", value: nearIV * 100 },
          { label: "Far", value: farIV * 100 },
        ]
      : [];

  if (points.length === 0) {
    return <div className="text-bb-gray text-[11px]">No term structure data</div>;
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const chartHeight = 200;
  const chartWidth = 400;
  const barWidth = chartWidth / points.length - 8;

  const isBackwardated = values[0] > values[values.length - 1];

  return (
    <div>
      <div className="text-[10px] text-bb-gray mb-1">
        {isBackwardated ? (
          <span className="text-bb-green">BACKWARDATION</span>
        ) : (
          <span className="text-bb-red">CONTANGO</span>
        )}
      </div>
      <svg width={chartWidth} height={chartHeight + 20} className="font-mono">
        {points.map((p, i) => {
          const barHeight = ((p.value - min) / range) * chartHeight * 0.8 + chartHeight * 0.1;
          const x = i * (chartWidth / points.length) + 2;
          const y = chartHeight - barHeight;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={i === 0 && isBackwardated ? "#4af6c3" : "#fb8b1e"}
                opacity={0.7}
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fill="#cccccc"
                fontSize="12"
              >
                {p.label}
              </text>
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fill="#fb8b1e"
                fontSize="12"
                fontWeight="bold"
              >
                {p.value.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
