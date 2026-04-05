import { rollingRealizedVol } from "./volatility";
import { percentile } from "./statistics";
import type { HistoricalBar } from "../types";

export interface IVPercentilePoint {
  date: string;
  percentile: number; // 0-100
}

export function computeIVPercentileSeries(
  history: HistoricalBar[]
): IVPercentilePoint[] {
  const prices = history.map((b) => b.close);
  const vols = rollingRealizedVol(prices, 20);

  // Use all available vol history as the ranking distribution.
  // For each day, rank against all vol values up to that point.
  const result: IVPercentilePoint[] = [];
  const minLookback = 40; // need at least 40 data points for meaningful percentile

  for (let i = minLookback; i < vols.length; i++) {
    const currentVol = vols[i];
    const historicalWindow = vols.slice(0, i);
    const pctl = percentile(currentVol, historicalWindow);
    // vols[i] corresponds to history[i + 20] (20-day vol window offset)
    const historyIndex = i + 20;
    if (historyIndex < history.length) {
      result.push({
        date: history[historyIndex].date,
        percentile: Math.round(pctl * 100),
      });
    }
  }

  return result;
}
