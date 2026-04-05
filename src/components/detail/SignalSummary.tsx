"use client";

import type { CriteriaScores } from "@/lib/types";
import { ScoreBar } from "../scanner/ScoreBar";
import { Badge } from "../bloomberg/Badge";
import { InfoTooltip } from "../bloomberg/InfoTooltip";

interface SignalSummaryProps {
  criteria: CriteriaScores;
  compositeScore: number;
}

const CRITERIA_INFO: Array<{
  key: keyof CriteriaScores;
  name: string;
  description: string;
  quote: string;
  attribution: string;
}> = [
  {
    key: "ivPercentile",
    name: "IV PERCENTILE",
    description: "Current implied vol rank vs 252-day history",
    quote:
      "You want to buy insurance when no one thinks they need it. When IV percentile is low, the market is complacent — that's when optionality is cheapest and the asymmetry is greatest.",
    attribution: "— Cem Karsan",
  },
  {
    key: "skewKurtosis",
    name: "SKEW & KURTOSIS",
    description: "Steep skew + fat tails = tail risk priced in. High kurtosis + low skew = underpriced.",
    quote:
      "The entire edifice of modern finance is built on the assumption that returns are normally distributed. They are not. The real world has fat tails — events that models say should happen once in ten thousand years happen every few years.",
    attribution: "— Nassim Taleb",
  },
  {
    key: "dealerGamma",
    name: "DEALER GAMMA",
    description: "Net dealer gamma exposure (neg = short gamma)",
    quote:
      "When dealers are short gamma, they have to sell into declines and buy into rallies. They amplify moves. That's the mechanical flow that creates the volatility events most people aren't positioned for.",
    attribution: "— Cem Karsan",
  },
  {
    key: "termStructure",
    name: "TERM STRUCTURE",
    description: "Near vs far term IV ratio",
    quote:
      "When the front of the curve inverts over the back — when near-term vol exceeds longer-term vol — the market is telling you it sees an immediate risk that hasn't been resolved. Pay attention to what the term structure is saying.",
    attribution: "— Cem Karsan",
  },
  {
    key: "vanna",
    name: "VANNA EXPOSURE",
    description: "dDelta/dVol — vol-driven hedging flows",
    quote:
      "Vanna is the hidden force. When volatility moves, deltas shift, and dealers have to re-hedge. That re-hedging creates the flows that amplify the original move. It's a feedback loop most people don't see.",
    attribution: "— Cem Karsan",
  },
  {
    key: "charm",
    name: "CHARM FLOWS",
    description: "dDelta/dTime — time-driven hedging flows",
    quote:
      "Every day that passes, options decay, deltas shift, and dealers must adjust. Near expiration, charm accelerates — the forced re-hedging creates predictable flow patterns that move the underlying.",
    attribution: "— Cem Karsan",
  },
];

export function SignalSummary({
  criteria,
  compositeScore,
}: SignalSummaryProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-bb-gray pb-2">
        <span className="text-bb-amber font-bold text-[13px]">
          COMPOSITE SCORE
        </span>
        <span className="text-bb-brightwhite font-bold text-[18px]">
          {(compositeScore * 100).toFixed(1)}
        </span>
      </div>
      {CRITERIA_INFO.map(({ key, name, description, quote, attribution }) => {
        const c = criteria[key];
        return (
          <div key={key} className="border-b border-bb-midgray pb-1">
            <div className="flex items-center justify-between">
              <span className="text-bb-amber text-[11px] font-bold">
                {name}
                <InfoTooltip quote={quote} attribution={attribution} />
              </span>
              <Badge signal={c.signal} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ScoreBar score={c.score} width={100} />
            </div>
            <div className="text-bb-white text-[11px] mt-1">{c.label}</div>
            <div className="text-bb-white/60 text-[11px]">{description}</div>
          </div>
        );
      })}
    </div>
  );
}
