/**
 * Black-Scholes Greeks approximations for gamma, vanna, charm.
 * Used to estimate dealer exposure from options open interest.
 */

/**
 * Standard normal PDF.
 */
function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF (Abramowitz & Stegun approximation).
 */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1 + sign * y);
}

interface BSInputs {
  S: number;     // spot price
  K: number;     // strike price
  T: number;     // time to expiry in years
  sigma: number; // implied volatility (annualized)
  r: number;     // risk-free rate
}

function d1(inputs: BSInputs): number {
  const { S, K, T, sigma, r } = inputs;
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function d2(inputs: BSInputs): number {
  return d1(inputs) - inputs.sigma * Math.sqrt(inputs.T);
}

/**
 * Gamma: d²V/dS². Measures convexity — same for calls and puts.
 */
export function gamma(inputs: BSInputs): number {
  const { S, sigma, T } = inputs;
  if (T <= 0 || sigma <= 0 || S <= 0) return 0;
  const d1Val = d1(inputs);
  return normalPdf(d1Val) / (S * sigma * Math.sqrt(T));
}

/**
 * Vanna: dDelta/dVol = d²V/(dS·dσ).
 * Negative vanna means when vol rises, delta shifts → forced hedging.
 */
export function vanna(inputs: BSInputs): number {
  const { sigma, T } = inputs;
  if (T <= 0 || sigma <= 0) return 0;
  const d1Val = d1(inputs);
  const d2Val = d2(inputs);
  return -d2Val * normalPdf(d1Val) / sigma;
}

/**
 * Charm: dDelta/dTime (aka delta decay).
 * Measures how delta changes as time passes — drives dealer re-hedging near expiry.
 */
export function charm(inputs: BSInputs): number {
  const { r, sigma, T } = inputs;
  if (T <= 0 || sigma <= 0) return 0;
  const d1Val = d1(inputs);
  const d2Val = d2(inputs);
  const sqrtT = Math.sqrt(T);
  return -normalPdf(d1Val) * (2 * r * T - d2Val * sigma * sqrtT) / (2 * T * sigma * sqrtT);
}

/**
 * Estimate net dealer gamma exposure across an options chain.
 * Assumes dealers are short what customers are long (standard assumption).
 * Returns negative value = dealers short gamma = moves amplified.
 */
export function netDealerGamma(
  options: Array<{
    strike: number;
    openInterest: number;
    impliedVolatility: number;
    type: "call" | "put";
    daysToExpiry: number;
  }>,
  spotPrice: number,
  riskFreeRate: number = 0.05
): number {
  let totalGamma = 0;
  for (const opt of options) {
    if (opt.openInterest <= 0 || opt.impliedVolatility <= 0) continue;
    const T = opt.daysToExpiry / 365;
    if (T <= 0) continue;
    const g = gamma({
      S: spotPrice,
      K: opt.strike,
      T,
      sigma: opt.impliedVolatility,
      r: riskFreeRate,
    });
    // Dealers are assumed short → negate
    // Multiply by 100 (contract multiplier) and OI
    totalGamma -= g * opt.openInterest * 100 * spotPrice;
  }
  return totalGamma;
}

/**
 * Aggregate vanna exposure across options chain.
 */
export function netVannaExposure(
  options: Array<{
    strike: number;
    openInterest: number;
    impliedVolatility: number;
    type: "call" | "put";
    daysToExpiry: number;
  }>,
  spotPrice: number,
  riskFreeRate: number = 0.05
): number {
  let totalVanna = 0;
  for (const opt of options) {
    if (opt.openInterest <= 0 || opt.impliedVolatility <= 0) continue;
    const T = opt.daysToExpiry / 365;
    if (T <= 0) continue;
    const v = vanna({
      S: spotPrice,
      K: opt.strike,
      T,
      sigma: opt.impliedVolatility,
      r: riskFreeRate,
    });
    totalVanna -= v * opt.openInterest * 100;
  }
  return totalVanna;
}

/**
 * Aggregate charm exposure across options chain.
 */
export function netCharmExposure(
  options: Array<{
    strike: number;
    openInterest: number;
    impliedVolatility: number;
    type: "call" | "put";
    daysToExpiry: number;
  }>,
  spotPrice: number,
  riskFreeRate: number = 0.05
): number {
  let totalCharm = 0;
  for (const opt of options) {
    if (opt.openInterest <= 0 || opt.impliedVolatility <= 0) continue;
    const T = opt.daysToExpiry / 365;
    if (T <= 0) continue;
    const c = charm({
      S: spotPrice,
      K: opt.strike,
      T,
      sigma: opt.impliedVolatility,
      r: riskFreeRate,
    });
    totalCharm -= c * opt.openInterest * 100;
  }
  return totalCharm;
}
