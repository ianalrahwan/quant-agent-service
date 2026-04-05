export interface ScanResult {
  symbol: string;
  name: string;
  lastPrice: number;
  change: number;
  changePct: number;
  compositeScore: number;
  criteria: CriteriaScores;
  timestamp: number;
}

export interface CriteriaScores {
  ivPercentile: CriterionResult;
  skewKurtosis: CriterionResult;
  dealerGamma: CriterionResult;
  termStructure: CriterionResult;
  vanna: CriterionResult;
  charm: CriterionResult;
}

export interface CriterionResult {
  score: number; // 0-1 normalized
  rawValue: number;
  label: string;
  signal: "strong" | "moderate" | "weak" | "neutral";
}

export interface OptionsChainData {
  symbol: string;
  expirations: string[];
  chains: Record<
    string,
    { calls: OptionContract[]; puts: OptionContract[] }
  >;
}

export interface OptionContract {
  strike: number;
  expiration: string;
  type: "call" | "put";
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
}

export interface VixTermStructure {
  vix9d: number;
  vix: number;
  vix3m: number;
  vix6m: number;
  vix1y: number;
  timestamp: number;
  isBackwardated: boolean;
  backwardationRatio: number;
}

export interface HistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap?: number;
}

export type SignalStrength = CriterionResult["signal"];

export function signalFromScore(score: number): SignalStrength {
  if (score >= 0.75) return "strong";
  if (score >= 0.5) return "moderate";
  if (score >= 0.25) return "weak";
  return "neutral";
}
