"use client";

import type { AgentAnalysisState, BearState } from "@/lib/agent-types";
import { BearMascot } from "./BearMascot";
import { PhasePipeline } from "./PhasePipeline";
import { TradeRecCards } from "./TradeRecCards";

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
        </div>
      )}
    </div>
  );
}
