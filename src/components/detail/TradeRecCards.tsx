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
