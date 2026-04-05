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
  const vols = rollingRealizedVol(prices, 30);

  const lookback = 252;
  const result: IVPercentilePoint[] = [];

  for (let i = lookback; i < vols.length; i++) {
    const currentVol = vols[i];
    const historicalWindow = vols.slice(i - lookback, i);
    const pctl = percentile(currentVol, historicalWindow);
    const historyIndex = i + 30;
    if (historyIndex < history.length) {
      result.push({
        date: history[historyIndex].date,
        percentile: Math.round(pctl * 100),
      });
    }
  }

  return result;
}
