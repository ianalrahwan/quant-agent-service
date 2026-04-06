"use client";

import type { AgentAnalysisState, BearState } from "@/lib/agent-types";
import { AgentLog } from "./AgentLog";
import { BearMascot } from "./BearMascot";
import { PhasePipeline } from "./PhasePipeline";
import { TradeRecCards } from "./TradeRecCards";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

interface AgentPanelProps {
  state: AgentAnalysisState;
  bearState: BearState;
  onStart: () => void;
  onResume: () => void;
  onReset: () => void;
}

export function AgentPanel({
  state,
  bearState,
  onStart,
  onResume,
  onReset,
}: AgentPanelProps) {
  return (
    <div className="border border-bb-gray bg-bb-black p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <BearMascot state={bearState} size={48} />
          <div>
            <h3 className="text-bb-amber text-sm font-bold">AGENT ANALYSIS</h3>
            {state.jobId && (
              <span className="text-bb-gray text-xs">{state.jobId}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {state.status === "idle" && (
            <button
              onClick={onStart}
              className="px-3 py-1 border border-bb-green text-bb-green text-xs hover:bg-bb-green/10 transition-colors"
            >
              RUN ANALYSIS [F5]
            </button>
          )}
          {state.status === "complete" && (
            <button
              onClick={onStart}
              className="px-3 py-1 border border-bb-green text-bb-green text-xs hover:bg-bb-green/10 transition-colors"
            >
              {state.cachedAt ? "REFRESH ANALYSIS [F5]" : "RUN ANALYSIS [F5]"}
            </button>
          )}
          {state.status === "checkpoint" && (
            <button
              onClick={onResume}
              className="px-3 py-1 border border-bb-amber text-bb-amber text-xs hover:bg-bb-amber/10 animate-pulse transition-colors"
            >
              CONTINUE
            </button>
          )}
          {(state.status === "complete" || state.status === "error") && (
            <button
              onClick={onReset}
              className="px-3 py-1 border border-bb-gray text-bb-white text-xs hover:bg-bb-gray/10 transition-colors"
            >
              RESET
            </button>
          )}
        </div>
      </div>

      {/* Phase pipeline */}
      {state.status !== "idle" && (
        <div className="mb-3">
          <PhasePipeline phases={state.phases} />
        </div>
      )}

      {/* Log output */}
      {state.logs.length > 0 && (
        <div className="mb-3">
          <AgentLog logs={state.logs} />
        </div>
      )}

      {/* Checkpoint message */}
      {state.checkpointMessage && (
        <div className="border border-bb-amber bg-bb-amber/5 p-2 mb-3 text-xs text-bb-amber">
          ⏸ {state.checkpointMessage}
        </div>
      )}

      {/* Narrative stream */}
      {state.narrativeTokens && (
        <div className="mb-3">
          <div className="text-xs text-bb-gray mb-1">NARRATIVE</div>
          <div className="text-sm text-bb-brightwhite leading-relaxed bg-bb-darkgray p-3 border border-bb-gray max-h-48 overflow-y-auto">
            {state.narrativeTokens}
            {state.status === "running" && (
              <span className="animate-pulse text-bb-amber">▌</span>
            )}
          </div>
        </div>
      )}

      {/* Trade recommendations */}
      {state.tradeRecs.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-bb-gray mb-1">TRADE RECOMMENDATIONS</div>
          <TradeRecCards recs={state.tradeRecs} />
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="border border-bb-red bg-bb-red/5 p-2 text-xs text-bb-red">
          ERROR: {state.error}
        </div>
      )}

      {/* Completion */}
      {state.status === "complete" && state.totalTime && (
        <div className="text-xs text-bb-green">
          ✓ Analysis complete in {state.totalTime.toFixed(1)}s
          {state.cachedAt && (
            <span className="text-xs text-bb-white/40 font-mono ml-2">
              cached {timeAgo(state.cachedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
