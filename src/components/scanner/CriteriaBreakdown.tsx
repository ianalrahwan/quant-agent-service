"use client";

import type { CriteriaScores } from "@/lib/types";
import { ScoreBar } from "./ScoreBar";

interface CriteriaBreakdownProps {
  criteria: CriteriaScores;
}

const CRITERIA_LABELS: Record<keyof CriteriaScores, { name: string; weight: string }> = {
  ivPercentile: { name: "IV Percentile", weight: "25%" },
  skewKurtosis: { name: "Skew & Kurtosis", weight: "20%" },
  dealerGamma: { name: "Dealer Gamma", weight: "20%" },
  termStructure: { name: "Term Structure", weight: "15%" },
  vanna: { name: "Vanna Exposure", weight: "10%" },
  charm: { name: "Charm Flows", weight: "10%" },
};

export function CriteriaBreakdown({ criteria }: CriteriaBreakdownProps) {
  return (
    <div className="text-[11px] space-y-1">
      {(Object.keys(CRITERIA_LABELS) as Array<keyof CriteriaScores>).map(
        (key) => {
          const c = criteria[key];
          const meta = CRITERIA_LABELS[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-bb-amber w-[14ch] shrink-0">
                {meta.name}
              </span>
              <span className="text-bb-gray w-[4ch] text-right shrink-0">
                {meta.weight}
              </span>
              <ScoreBar score={c.score} width={80} />
              <span className="text-bb-white truncate">{c.label}</span>
            </div>
          );
        }
      )}
    </div>
  );
}
