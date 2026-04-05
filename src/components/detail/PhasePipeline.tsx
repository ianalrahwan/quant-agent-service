"use client";

import type { AgentPhase } from "@/lib/agent-types";

interface PhasePipelineProps {
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
}

const PHASE_LABELS: Record<AgentPhase, string> = {
  freshness_check: "FRESH",
  discovery: "DISC",
  signal_confirm: "SIG",
  vol_surface: "VOL",
  narrative_sources: "NAR",
  synthesis: "SYN",
  trade_rec: "REC",
};

export function PhasePipeline({ phases }: PhasePipelineProps) {
  const entries = Array.from(phases.entries());

  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      {entries.map(([phase, status], i) => (
        <div key={phase} className="flex items-center">
          <div
            className={`px-2 py-0.5 border ${
              status === "complete"
                ? "border-bb-green text-bb-green bg-bb-green/10"
                : status === "in_progress"
                  ? "border-bb-amber text-bb-amber bg-bb-amber/10 animate-pulse"
                  : "border-bb-gray text-bb-gray"
            }`}
          >
            {PHASE_LABELS[phase]}
          </div>
          {i < entries.length - 1 && (
            <span
              className={`mx-0.5 ${
                status === "complete" ? "text-bb-green" : "text-bb-gray"
              }`}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
