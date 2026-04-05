/**
 * Volatility computations: realized vol, IV percentile, term structure.
 */

import { standardDeviation, logReturns, percentile } from "./statistics";

/**
 * Annualized realized volatility from daily closing prices.
 * Uses a rolling window of `window` trading days.
 */
export function realizedVolatility(
  prices: number[],
  window: number = 30
): number {
  if (prices.length < window + 1) return 0;
  const recent = prices.slice(-window - 1);
  const returns = logReturns(recent);
  return standardDeviation(returns) * Math.sqrt(252);
}

/**
 * Compute a rolling series of realized volatility values,
 * one per day, using a trailing window.
 */
export function rollingRealizedVol(
  prices: number[],
  window: number = 30
): number[] {
  const vols: number[] = [];
  for (let i = window; i < prices.length; i++) {
    const slice = prices.slice(i - window, i + 1);
    vols.push(realizedVolatility(slice, window));
  }
  return vols;
}

/**
 * IV Percentile: where does current IV rank in the distribution
 * of historical IV values (or realized vol as proxy)?
 * Returns 0-1 (e.g., 0.12 = 12th percentile = vol is cheap).
 */
export function ivPercentileRank(
  currentIV: number,
  historicalVols: number[]
): number {
  return percentile(currentIV, historicalVols);
}

/**
 * Term structure ratio: near-term IV / far-term IV.
 * > 1.0 = backwardation (near > far), < 1.0 = contango.
 */
export function termStructureRatio(
  nearTermIV: number,
  farTermIV: number
): number {
  if (farTermIV <= 0) return 1;
  return nearTermIV / farTermIV;
}
