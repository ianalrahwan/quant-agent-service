/**
 * Six scoring criteria for Karsan/Taleb long vol plays.
 * Each returns a CriterionResult with score normalized 0-1.
 */

import type {
  CriterionResult,
  OptionsChainData,
  HistoricalBar,
  VixTermStructure,
} from "../types";
import { signalFromScore } from "../types";
import {
  excessKurtosis,
  logReturns,
  mean,
  standardDeviation,
} from "../math/statistics";
import {
  rollingRealizedVol,
  termStructureRatio,
} from "../math/volatility";
import {
  netDealerGamma,
  netVannaExposure,
  netCharmExposure,
} from "../math/greeks";

/**
 * Helper: get ATM implied volatility from an options chain.
 * Finds the call strike closest to spot price in the nearest expiration.
 */
function getAtmIV(chain: OptionsChainData, spotPrice: number): number {
  const firstExp = Object.keys(chain.chains)[0];
  if (!firstExp) return 0;
  const calls = chain.chains[firstExp].calls;
  if (calls.length === 0) return 0;

  let closest = calls[0];
  let minDist = Math.abs(calls[0].strike - spotPrice);
  for (const c of calls) {
    const dist = Math.abs(c.strike - spotPrice);
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }
  return closest.impliedVolatility;
}

/**
 * Helper: get 25-delta put IV approximation.
 * Uses the put strike at ~5% OTM as a proxy for 25-delta.
 */
function get25DeltaPutIV(
  chain: OptionsChainData,
  spotPrice: number
): number {
  const firstExp = Object.keys(chain.chains)[0];
  if (!firstExp) return 0;
  const puts = chain.chains[firstExp].puts;
  if (puts.length === 0) return 0;

  const targetStrike = spotPrice * 0.95;
  let closest = puts[0];
  let minDist = Math.abs(puts[0].strike - targetStrike);
  for (const p of puts) {
    const dist = Math.abs(p.strike - targetStrike);
    if (dist < minDist) {
      minDist = dist;
      closest = p;
    }
  }
  return closest.impliedVolatility;
}

/**
 * Flatten all options from a chain into a single array with daysToExpiry.
 */
function flattenOptions(
  chain: OptionsChainData
): Array<{
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  type: "call" | "put";
  daysToExpiry: number;
}> {
  const now = Date.now();
  const result: Array<{
    strike: number;
    openInterest: number;
    impliedVolatility: number;
    type: "call" | "put";
    daysToExpiry: number;
  }> = [];

  for (const [expStr, { calls, puts }] of Object.entries(chain.chains)) {
    const expDate = new Date(expStr).getTime();
    const daysToExpiry = Math.max(1, (expDate - now) / (1000 * 60 * 60 * 24));
    for (const c of calls) {
      result.push({
        strike: c.strike,
        openInterest: c.openInterest,
        impliedVolatility: c.impliedVolatility,
        type: "call",
        daysToExpiry,
      });
    }
    for (const p of puts) {
      result.push({
        strike: p.strike,
        openInterest: p.openInterest,
        impliedVolatility: p.impliedVolatility,
        type: "put",
        daysToExpiry,
      });
    }
  }
  return result;
}

// ─── Criterion 1: IV Percentile ──────────────────────────────────

export function scoreIVPercentile(
  chain: OptionsChainData,
  history: HistoricalBar[],
  spotPrice: number
): CriterionResult {
  const currentIV = getAtmIV(chain, spotPrice);
  if (currentIV <= 0 || history.length < 60) {
    return { score: 0, rawValue: 0, label: "Insufficient data", signal: "neutral" };
  }

  // Collect all ATM IVs across available expirations as a proxy
  // for where current IV sits. Compare against historical realized vol
  // distribution, but scale realized vol to match IV magnitude.
  const prices = history.map((b) => b.close);
  const historicalVols = rollingRealizedVol(prices, 30);

  if (historicalVols.length < 20) {
    return { score: 0, rawValue: 0, label: "Insufficient history", signal: "neutral" };
  }

  // Rank current ATM IV against historical realized vol.
  // Since IV tends to run higher than realized (variance risk premium),
  // normalize by comparing IV to the distribution's own mean + std.
  const volMean = mean(historicalVols);
  const volStd = Math.max(0.01, standardDeviation(historicalVols));
  const ivZScore = (currentIV - volMean) / volStd;

  // Map z-score to percentile-like value:
  // z=0 means IV equals avg realized vol → ~50th percentile
  // z=-2 means IV far below realized → very cheap → ~5th percentile
  // z=+2 means IV far above realized → expensive → ~95th percentile
  const pctl = Math.max(0, Math.min(1, 0.5 + ivZScore * 0.2));

  // Lower percentile = cheaper vol = better for long vol
  const score = Math.max(0, Math.min(1, 1 - pctl));
  const label = `IV at ${(pctl * 100).toFixed(0)}th percentile`;

  return { score, rawValue: pctl, label, signal: signalFromScore(score) };
}

// ─── Criterion 2: Negative Skew + Fat Tails ─────────────────────

export function scoreSkewKurtosis(
  chain: OptionsChainData,
  history: HistoricalBar[],
  spotPrice: number
): CriterionResult {
  const atmIV = getAtmIV(chain, spotPrice);
  const putIV = get25DeltaPutIV(chain, spotPrice);
  const putSkew = putIV - atmIV;

  const prices = history.slice(-61).map((b) => b.close);
  const returns = logReturns(prices);
  const kurtosis = excessKurtosis(returns);

  // Skew score: steeper put skew (positive putSkew) = market pricing tail risk
  // But the EDGE is when realized kurtosis exceeds what skew implies
  const skewScore = Math.max(0, Math.min(1, putSkew / 0.15));
  // Kurtosis score: higher excess kurtosis = fatter realized tails
  const kurtosisScore = Math.max(0, Math.min(1, kurtosis / 5));
  // Mismatch bonus: high kurtosis + low skew = market underpricing tails
  const mismatch = kurtosisScore > skewScore ? (kurtosisScore - skewScore) * 0.3 : 0;

  const score = Math.min(1, 0.35 * skewScore + 0.35 * kurtosisScore + 0.3 * (skewScore + kurtosisScore) / 2 + mismatch);
  const label = `Skew: ${(putSkew * 100).toFixed(1)}%, Kurt: ${kurtosis.toFixed(1)}`;

  return { score, rawValue: putSkew, label, signal: signalFromScore(score) };
}

// ─── Criterion 3: Dealer Short Gamma ────────────────────────────

export function scoreDealerGamma(
  chain: OptionsChainData,
  spotPrice: number
): CriterionResult {
  const options = flattenOptions(chain);
  if (options.length === 0) {
    return { score: 0, rawValue: 0, label: "No options data", signal: "neutral" };
  }

  const gex = netDealerGamma(options, spotPrice);

  // Negative GEX = dealers short gamma = amplified moves = good for long vol
  // Normalize: typical GEX range varies by symbol, use sigmoid
  const normalized = -gex / (Math.abs(gex) + 1e8);
  const score = Math.max(0, Math.min(1, 0.5 + normalized * 0.5));

  const gexBillions = gex / 1e9;
  const label = `GEX: ${gexBillions.toFixed(2)}B ${gex < 0 ? "(short γ)" : "(long γ)"}`;

  return { score, rawValue: gex, label, signal: signalFromScore(score) };
}

// ─── Criterion 4: Term Structure Backwardation ──────────────────

export function scoreTermStructure(
  chain: OptionsChainData,
  spotPrice: number,
  vixData: VixTermStructure | null
): CriterionResult {
  let ratio: number;
  let labelPrefix: string;

  if (vixData) {
    // For SPY/index, use VIX term structure directly
    ratio = vixData.backwardationRatio;
    labelPrefix = `VIX/VIX3M: ${ratio.toFixed(2)}`;
  } else {
    // For individual tickers, compare near vs far expiry ATM IV
    const exps = Object.keys(chain.chains);
    if (exps.length < 2) {
      return { score: 0, rawValue: 1, label: "Need 2+ expirations", signal: "neutral" };
    }

    const nearCalls = chain.chains[exps[0]].calls;
    const farCalls = chain.chains[exps[exps.length - 1]].calls;

    const nearATM = findClosestStrike(nearCalls, spotPrice);
    const farATM = findClosestStrike(farCalls, spotPrice);
    if (!nearATM || !farATM || farATM.impliedVolatility <= 0) {
      return { score: 0, rawValue: 1, label: "No ATM data", signal: "neutral" };
    }

    ratio = termStructureRatio(nearATM.impliedVolatility, farATM.impliedVolatility);
    labelPrefix = `Near/Far IV: ${ratio.toFixed(2)}`;
  }

  // Score: backwardation (>1.0) is strongest signal for long vol,
  // but contango still carries information — deep contango = complacency
  let score: number;
  if (ratio > 1.15) {
    score = 1.0; // strong backwardation
  } else if (ratio > 1.0) {
    score = 0.5 + (ratio - 1.0) / 0.15 * 0.5; // 0.5 to 1.0
  } else if (ratio > 0.95) {
    score = 0.3 + (ratio - 0.95) / 0.05 * 0.2; // 0.3 to 0.5 — near flat
  } else if (ratio > 0.85) {
    score = 0.1 + (ratio - 0.85) / 0.10 * 0.2; // 0.1 to 0.3 — moderate contango
  } else {
    score = 0.1; // deep contango — still not zero
  }

  const regime = ratio > 1.0 ? "(backwardated)" : "(contango)";
  const label = `${labelPrefix} ${regime}`;

  return {
    score: Math.min(1, score),
    rawValue: ratio,
    label,
    signal: signalFromScore(Math.min(1, score)),
  };
}

function findClosestStrike(
  contracts: Array<{ strike: number; impliedVolatility: number }>,
  spotPrice: number
) {
  if (contracts.length === 0) return null;
  let closest = contracts[0];
  let minDist = Math.abs(contracts[0].strike - spotPrice);
  for (const c of contracts) {
    const dist = Math.abs(c.strike - spotPrice);
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }
  return closest;
}

// ─── Criterion 5: Vanna Exposure ────────────────────────────────

export function scoreVanna(
  chain: OptionsChainData,
  spotPrice: number
): CriterionResult {
  const options = flattenOptions(chain);
  if (options.length === 0) {
    return { score: 0, rawValue: 0, label: "No options data", signal: "neutral" };
  }

  const netVanna = netVannaExposure(options, spotPrice);

  // Large negative vanna = vol rise shifts deltas → forced selling → amplifies
  const normalized = -netVanna / (Math.abs(netVanna) + 1e6);
  const score = Math.max(0, Math.min(1, 0.5 + normalized * 0.5));
  const label = `Net Vanna: ${(netVanna / 1e3).toFixed(1)}K`;

  return { score, rawValue: netVanna, label, signal: signalFromScore(score) };
}

// ─── Criterion 6: Charm Flows ───────────────────────────────────

export function scoreCharm(
  chain: OptionsChainData,
  spotPrice: number
): CriterionResult {
  const options = flattenOptions(chain);
  if (options.length === 0) {
    return { score: 0, rawValue: 0, label: "No options data", signal: "neutral" };
  }

  const netCharm = netCharmExposure(options, spotPrice);

  // High absolute charm near expiry = lots of forced re-hedging
  const absMagnitude = Math.abs(netCharm);
  const normalized = absMagnitude / (absMagnitude + 1e5);
  const score = Math.max(0, Math.min(1, normalized));

  const label = `Net Charm: ${(netCharm / 1e3).toFixed(1)}K`;
  return { score, rawValue: netCharm, label, signal: signalFromScore(score) };
}

// ─── Utility: get average IV for term structure of individual names ─

export function getAvgAtmIV(
  chain: OptionsChainData,
  spotPrice: number
): { nearIV: number; farIV: number } {
  const exps = Object.keys(chain.chains);
  const nearIV = exps[0] ? getAtmIV({ ...chain, chains: { [exps[0]]: chain.chains[exps[0]] } }, spotPrice) : 0;
  const farIV = exps.length > 1
    ? getAtmIV({ ...chain, chains: { [exps[exps.length - 1]]: chain.chains[exps[exps.length - 1]] } }, spotPrice)
    : nearIV;
  return { nearIV, farIV };
}
