/**
 * Core statistical functions for volatility analysis.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

export function percentile(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 0;
  const count = distribution.filter((v) => v < value).length;
  return count / distribution.length;
}

/**
 * Excess kurtosis (subtract 3 from raw kurtosis so normal = 0).
 * Positive = leptokurtic (fat tails), negative = platykurtic.
 */
export function excessKurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const avg = mean(values);
  const std = standardDeviation(values);
  if (std === 0) return 0;
  const n = values.length;
  const m4 = values.reduce((sum, v) => sum + ((v - avg) / std) ** 4, 0) / n;
  return m4 - 3;
}

/**
 * Sample skewness. Negative = left tail heavier.
 */
export function skewness(values: number[]): number {
  if (values.length < 3) return 0;
  const avg = mean(values);
  const std = standardDeviation(values);
  if (std === 0) return 0;
  const n = values.length;
  return values.reduce((sum, v) => sum + ((v - avg) / std) ** 3, 0) / n;
}

/**
 * Daily log returns from a series of prices.
 */
export function logReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}
