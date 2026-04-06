"use client";

import type { AgentPhase } from "@/lib/agent-types";

type PhaseStatus = "pending" | "in_progress" | "complete" | "error" | "skipped";

interface PhasePipelineProps {
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
}

const DISCOVERY_PHASES: { key: AgentPhase; label: string }[] = [
  { key: "crawl_earnings", label: "EARN" },
  { key: "crawl_news", label: "NEWS" },
  { key: "crawl_podcasts", label: "POD" },
  { key: "crawl_cftc", label: "CFTC" },
];

const DISCOVERY_SEQ: { key: AgentPhase; label: string }[] = [
  { key: "chunk_embed", label: "CHUNK" },
  { key: "index", label: "INDEX" },
];

const TRADER_PHASES: { key: AgentPhase; label: string }[] = [
  { key: "signal_confirm", label: "SIGNAL" },
  { key: "vol_surface", label: "VOL" },
  { key: "narrative_sources", label: "NAR QUERY" },
  { key: "synthesis", label: "SYNTHESIS" },
  { key: "trade_rec", label: "TRADE REC" },
];

function statusClass(status: PhaseStatus): string {
  switch (status) {
    case "complete":
      return "border-bb-green text-bb-green bg-bb-green/10";
    case "in_progress":
      return "border-bb-amber text-bb-amber bg-bb-amber/10 animate-pulse";
    case "error":
      return "border-bb-red text-bb-red bg-bb-red/10";
    case "skipped":
      return "border-bb-gray/40 text-bb-gray/40";
    default:
      return "border-bb-gray text-bb-gray";
  }
}

function arrowClass(status: PhaseStatus): string {
  return status === "complete" ? "text-bb-green" : "text-bb-gray";
}

function Pill({ label, status }: { label: string; status: PhaseStatus }) {
  return (
    <div className={`px-2 py-0.5 border ${statusClass(status)}`}>
      {label}
    </div>
  );
}

function Arrow({ status }: { status: PhaseStatus }) {
  return <span className={`mx-0.5 ${arrowClass(status)}`}>→</span>;
}

function isDiscoverySkipped(
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">
): boolean {
  const freshDone = phases.get("freshness_check") === "complete";
  const allCrawlersPending = DISCOVERY_PHASES.every(
    (p) => phases.get(p.key) === "pending"
  );
  const traderStarted = TRADER_PHASES.some(
    (p) => phases.get(p.key) !== "pending"
  );
  return freshDone && allCrawlersPending && traderStarted;
}

export function PhasePipeline({ phases }: PhasePipelineProps) {
  const discoverySkipped = isDiscoverySkipped(phases);
  const freshStatus = phases.get("freshness_check") ?? "pending";

  return (
    <div className="flex flex-col gap-2 font-mono text-xs">
      {/* Row 1: Discovery */}
      <div>
        <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1">
          Discovery
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Pill label="FRESH" status={freshStatus} />
          <Arrow status={freshStatus} />

          {/* Parallel crawlers in a grouped box */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 border border-bb-gray/30 rounded-sm">
            {DISCOVERY_PHASES.map((p) => (
              <Pill
                key={p.key}
                label={p.label}
                status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
              />
            ))}
          </div>

          <Arrow
            status={
              discoverySkipped
                ? "skipped"
                : DISCOVERY_PHASES.every((p) => phases.get(p.key) === "complete")
                  ? "complete"
                  : "pending"
            }
          />

          {DISCOVERY_SEQ.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <Pill
                label={p.label}
                status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
              />
              {i < DISCOVERY_SEQ.length - 1 && (
                <Arrow
                  status={discoverySkipped ? "skipped" : (phases.get(p.key) ?? "pending")}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Trader */}
      <div>
        <div className="text-bb-gray/60 text-[10px] tracking-widest uppercase mb-1">
          Trader
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {TRADER_PHASES.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <Pill label={p.label} status={phases.get(p.key) ?? "pending"} />
              {i < TRADER_PHASES.length - 1 && (
                <Arrow status={phases.get(p.key) ?? "pending"} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
