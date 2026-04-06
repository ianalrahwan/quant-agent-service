// Backend API types for agent workflow

export interface ScannerSignals {
  iv_percentile: number;
  skew_kurtosis: number;
  dealer_gamma: number;
  term_structure: number;
  vanna: number;
  charm: number;
  composite: number;
}

export interface AnalyzeRequest {
  scanner_signals: ScannerSignals;
  auto_run?: boolean;
}

export interface JobResponse {
  job_id: string;
}

export interface SourceSummary {
  symbol: string;
  sources: {
    earnings: { last_updated: string | null; count: number };
    news: { last_updated: string | null; count: number };
    podcast: { last_updated: string | null; count: number };
    cftc: { last_updated: string | null; count: number };
  };
}

// SSE event types
export type AgentPhase =
  | "freshness_check"
  | "discovery"
  | "signal_confirm"
  | "vol_surface"
  | "narrative_sources"
  | "synthesis"
  | "trade_rec";

export interface PhaseEvent {
  phase: AgentPhase;
  status: "in_progress" | "complete";
  data?: Record<string, unknown>;
}

export interface CheckpointEvent {
  checkpoint: string;
  message: string;
}

export interface StreamEvent {
  phase: string;
  token: string;
}

export interface DoneEvent {
  job_id: string;
  total_time: number;
}

export interface ErrorEvent {
  phase?: string;
  error: string;
}

export interface LogEvent {
  message: string;
  phase?: string;
}

export type SSEEvent =
  | { type: "phase"; data: PhaseEvent }
  | { type: "checkpoint"; data: CheckpointEvent }
  | { type: "stream"; data: StreamEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: ErrorEvent };

export interface TradeRecommendation {
  strategy: string;
  direction: string;
  legs: Array<{
    action: string;
    expiry: string;
    strike: number;
    type: string;
  }>;
  rationale: string;
  estimated_greeks: { delta: number; vega: number; theta: number };
  risk_reward: string;
}

// Polling types (replaces SSE EventSource)
export interface PollEvent {
  index: number;
  type: "phase" | "checkpoint" | "stream" | "done" | "error" | "log";
  data: PhaseEvent | CheckpointEvent | StreamEvent | DoneEvent | ErrorEvent | LogEvent;
}

export interface PollResponse {
  events: PollEvent[];
  cursor: number;
  finished: boolean;
  checkpoint: boolean;
}

export type BearState = "idle" | "thinking" | "checkpoint" | "complete" | "error";

export interface CachedAnalysis {
  symbol: string;
  scanner_signals: ScannerSignals;
  narrative: string;
  trade_recs: TradeRecommendation[];
  vol_surface: Record<string, unknown> | null;
  phases_log: string[];
  total_time: number;
  created_at: string;
}

export interface AgentAnalysisState {
  status: "idle" | "running" | "checkpoint" | "complete" | "error";
  jobId: string | null;
  phases: Map<AgentPhase, "pending" | "in_progress" | "complete">;
  volSurface: Record<string, unknown> | null;
  narrativeTokens: string;
  tradeRecs: TradeRecommendation[];
  checkpointMessage: string | null;
  error: string | null;
  totalTime: number | null;
  logs: string[];
  cachedAt: string | null;
}
