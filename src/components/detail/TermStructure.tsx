"use client";

import type { VixTermStructure, OptionsChainData } from "@/lib/types";

interface TermStructureProps {
  vixData: VixTermStructure | null;
  chain: OptionsChainData | null;
  spotPrice: number;
  isIndex?: boolean;
}

function getTermStructureFromChain(
  chain: OptionsChainData,
  spotPrice: number
): Array<{ label: string; value: number }> {
  const points: Array<{ label: string; value: number }> = [];

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

    if (closest.impliedVolatility > 0) {
      const d = new Date(expStr);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      points.push({ label, value: closest.impliedVolatility * 100 });
    }
  }

  return points;
}

export function TermStructureChart({
  vixData,
  chain,
  spotPrice,
  isIndex = false,
}: TermStructureProps) {
  let points: Array<{ label: string; value: number }> = [];
  let title = "";

  if (isIndex && vixData) {
    points = [
      { label: "9D", value: vixData.vix9d },
      { label: "1M", value: vixData.vix },
      { label: "3M", value: vixData.vix3m },
      { label: "6M", value: vixData.vix6m },
      { label: "1Y", value: vixData.vix1y },
    ].filter((p) => p.value > 0);
    title = "VIX TERM STRUCTURE";
  } else if (chain && spotPrice > 0) {
    points = getTermStructureFromChain(chain, spotPrice);
    title = "ATM IV BY EXPIRATION";
  }

  if (points.length === 0) {
    return (
      <div className="text-bb-white/40 text-[11px]">No term structure data</div>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const isBackwardated = values[0] > values[values.length - 1];

  return (
    <div>
      <div className="text-[11px] mb-1 flex items-center gap-2">
        <span className="text-bb-white/60">{title}</span>
        {isBackwardated ? (
          <span className="text-bb-green font-bold">BACKWARDATION</span>
        ) : (
          <span className="text-bb-red font-bold">CONTANGO</span>
        )}
      </div>
      {/* Bar chart */}
      <div className="flex items-end gap-2 pt-6" style={{ height: 160 }}>
        {points.map((p, i) => {
          const normalized = (p.value - min) / range;
          const barHeight = Math.max(16, normalized * 100 + 16);
          const isFirst = i === 0;
          return (
            <div key={p.label} className="flex flex-col items-center flex-1">
              <span className="text-bb-amber text-[12px] font-bold mb-1">
                {p.value.toFixed(1)}
              </span>
              <div
                className="w-full min-w-[30px]"
                style={{
                  height: barHeight,
                  backgroundColor:
                    isFirst && isBackwardated
                      ? "rgba(74, 246, 195, 0.7)"
                      : "rgba(251, 139, 30, 0.7)",
                }}
              />
              <span className="text-bb-white text-[11px] mt-1">{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
