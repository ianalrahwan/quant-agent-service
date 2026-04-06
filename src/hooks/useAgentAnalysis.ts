"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AgentAnalysisState,
  AgentPhase,
  AnalyzeRequest,
  BearState,
  CheckpointEvent,
  DoneEvent,
  ErrorEvent,
  JobResponse,
  PhaseEvent,
  StreamEvent,
  TradeRecommendation,
} from "@/lib/agent-types";

// Proxy through Next.js API routes to avoid mixed content (HTTPS -> HTTP)
const BACKEND_URL = "";

const INITIAL_PHASES: [AgentPhase, "pending"][] = [
  ["freshness_check", "pending"],
  ["discovery", "pending"],
  ["signal_confirm", "pending"],
  ["vol_surface", "pending"],
  ["narrative_sources", "pending"],
  ["synthesis", "pending"],
  ["trade_rec", "pending"],
];

function initialState(): AgentAnalysisState {
  return {
    status: "idle",
    jobId: null,
    phases: new Map(INITIAL_PHASES),
    volSurface: null,
    narrativeTokens: "",
    tradeRecs: [],
    checkpointMessage: null,
    error: null,
    totalTime: null,
  };
}

export function useAgentAnalysis() {
  const [state, setState] = useState<AgentAnalysisState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAnalysis = useCallback(
    async (symbol: string, request: AnalyzeRequest) => {
      setState({ ...initialState(), status: "running" });

      try {
        const resp = await fetch(`/api/agent/analyze/${symbol}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!resp.ok) throw new Error(`Analysis request failed: ${resp.status}`);

        const { job_id }: JobResponse = await resp.json();
        setState((prev) => ({ ...prev, jobId: job_id }));

        const es = new EventSource(`/api/agent/stream/${job_id}`);
        eventSourceRef.current = es;

        es.addEventListener("phase", (e) => {
          const data: PhaseEvent = JSON.parse(e.data);
          setState((prev) => {
            const phases = new Map(prev.phases);
            phases.set(data.phase, data.status === "complete" ? "complete" : "in_progress");
            return {
              ...prev,
              phases,
              volSurface:
                data.phase === "vol_surface" && data.data ? data.data : prev.volSurface,
            };
          });
        });

        es.addEventListener("checkpoint", (e) => {
          const data: CheckpointEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "checkpoint",
            checkpointMessage: data.message,
          }));
        });

        es.addEventListener("stream", (e) => {
          const data: StreamEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            narrativeTokens: prev.narrativeTokens + data.token,
          }));
        });

        es.addEventListener("done", (e) => {
          const data: DoneEvent = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: "complete",
            totalTime: data.total_time,
          }));
          es.close();
        });

        es.addEventListener("error", (e) => {
          if (e instanceof MessageEvent) {
            const data: ErrorEvent = JSON.parse(e.data);
            setState((prev) => ({
              ...prev,
              status: "error",
              error: data.error,
            }));
          }
          es.close();
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    []
  );

  const resumeCheckpoint = useCallback(async () => {
    const jobId = state.jobId;
    if (!jobId) return;

    setState((prev) => ({
      ...prev,
      status: "running",
      checkpointMessage: null,
    }));

    await fetch(`/api/agent/stream/${jobId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "resume", user_input: { proceed: true } }),
    });
  }, [state.jobId]);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    setState(initialState());
  }, []);

  const bearState: BearState =
    state.status === "idle"
      ? "idle"
      : state.status === "running"
        ? "thinking"
        : state.status === "checkpoint"
          ? "checkpoint"
          : state.status === "complete"
            ? "complete"
            : "error";

  return {
    state,
    bearState,
    startAnalysis,
    resumeCheckpoint,
    reset,
  };
}
