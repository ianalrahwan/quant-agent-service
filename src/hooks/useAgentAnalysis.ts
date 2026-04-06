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
  LogEvent,
  PhaseEvent,
  PollEvent,
  PollResponse,
  StreamEvent,
} from "@/lib/agent-types";

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
    logs: [],
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export function useAgentAnalysis() {
  const [state, setState] = useState<AgentAnalysisState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);

  function processBatch(events: PollEvent[]) {
    setState((prev) => {
      const phases = new Map(prev.phases);
      let volSurface = prev.volSurface;
      let narrativeTokens = prev.narrativeTokens;
      let status = prev.status;
      let checkpointMessage = prev.checkpointMessage;
      let error = prev.error;
      let totalTime = prev.totalTime;
      const logs = [...prev.logs];

      for (const evt of events) {
        switch (evt.type) {
          case "phase": {
            const d = evt.data as PhaseEvent;
            phases.set(d.phase, d.status === "complete" ? "complete" : "in_progress");
            if (d.phase === "vol_surface" && d.data) volSurface = d.data;
            break;
          }
          case "checkpoint": {
            const d = evt.data as CheckpointEvent;
            status = "checkpoint";
            checkpointMessage = d.message;
            logs.push(`⏸ Awaiting input: ${d.message}`);
            break;
          }
          case "log": {
            const d = evt.data as LogEvent;
            logs.push(d.message);
            break;
          }
          case "stream": {
            const d = evt.data as StreamEvent;
            narrativeTokens += d.token;
            break;
          }
          case "done": {
            const d = evt.data as DoneEvent;
            status = "complete";
            totalTime = d.total_time;
            logs.push(`✓ Analysis complete in ${d.total_time.toFixed(1)}s`);
            break;
          }
          case "error": {
            const d = evt.data as ErrorEvent;
            status = "error";
            error = d.error;
            logs.push(`✗ Error: ${d.error}`);
            break;
          }
        }
      }

      return {
        ...prev,
        phases,
        volSurface,
        narrativeTokens,
        status,
        checkpointMessage,
        error,
        totalTime,
        logs,
      };
    });
  }

  async function pollLoop(jobId: string, signal: AbortSignal) {
    let cursor = 0;

    while (!signal.aborted) {
      let batch: PollResponse;
      try {
        const resp = await fetch(`/api/agent/poll/${jobId}?cursor=${cursor}`, { signal });
        batch = await resp.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "Connection lost",
          logs: [...prev.logs, "✗ Error: Connection lost"],
        }));
        return;
      }

      if (batch.events.length > 0) {
        processBatch(batch.events);
      }

      cursor = batch.cursor;

      if (batch.finished) return;

      if (batch.checkpoint) {
        // Pause polling until resumeCheckpoint() is called
        try {
          await new Promise<void>((resolve, reject) => {
            resumeRef.current = resolve;
            signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          });
        } catch {
          return;
        }
        continue;
      }

      // If no events, wait before next poll to avoid tight loop
      if (batch.events.length === 0) {
        try {
          await delay(1000, signal);
        } catch {
          return;
        }
      }
    }
  }

  const startAnalysis = useCallback(
    async (symbol: string, request: AnalyzeRequest) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setState({ ...initialState(), status: "running" });

      try {
        const resp = await fetch(`/api/agent/analyze/${symbol}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: ac.signal,
        });

        if (!resp.ok) throw new Error(`Analysis request failed: ${resp.status}`);

        const { job_id }: JobResponse = await resp.json();
        setState((prev) => ({ ...prev, jobId: job_id }));

        pollLoop(job_id, ac.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
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

    // Unblock the poll loop
    resumeRef.current?.();
    resumeRef.current = null;
  }, [state.jobId]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    resumeRef.current = null;
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
