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

        const legs = isExpanded ? matchLegs(rec, chain) : null;
        const maxDte = isExpanded
          ? Math.max(...rec.legs.map((l) => daysUntil(l.expiry)), 1)
          : 1;

        return (
          <div
            key={i}
            className={`border bg-bb-darkgray p-3 font-mono text-sm cursor-pointer transition-colors ${
              isExpanded
                ? "border-bb-amber"
                : "border-bb-gray hover:border-bb-amber/50"
            }`}
            onClick={() => setExpandedIdx(isExpanded ? null : i)}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
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
              <span className="text-bb-gray text-xs select-none">
                {isExpanded ? "▲" : "▼"}
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

            {/* Rationale — truncated when collapsed */}
            {!isExpanded && (
              <div className="text-xs text-bb-white/70 line-clamp-2">
                {rec.rationale}
              </div>
            )}

            {/* Risk/Reward — collapsed only */}
            {!isExpanded && (
              <div className="text-xs text-bb-amber mt-1">{rec.risk_reward}</div>
            )}

            {/* Expanded detail — stopPropagation so clicks inside don't collapse */}
            {isExpanded && legs && (
              <div onClick={(e) => e.stopPropagation()}>
                <PayoffChart
                  legs={legs}
                  spotPrice={spotPrice}
                  maxDte={maxDte}
                />
                <TradeRecDetail rec={rec} chain={chain} spotPrice={spotPrice} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
