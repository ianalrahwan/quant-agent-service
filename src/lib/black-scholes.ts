/**
 * Black-Scholes option pricing for payoff chart date slider.
 */

const RISK_FREE_RATE = 0.05;

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

/** Black-Scholes price for a European option. */
export function bsPrice(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  type: "call" | "put"
): number {
  if (dte <= 0) {
    return type === "call"
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
  }

  const t = dte / 365;
  const d1 =
    (Math.log(spot / strike) + (RISK_FREE_RATE + (iv * iv) / 2) * t) /
    (iv * Math.sqrt(t));
  const d2 = d1 - iv * Math.sqrt(t);
  const discount = Math.exp(-RISK_FREE_RATE * t);

  if (type === "call") {
    return spot * normCdf(d1) - strike * discount * normCdf(d2);
  }
  return strike * discount * normCdf(-d2) - spot * normCdf(-d1);
}

/** Calculate P&L for a single leg at a given spot and DTE. */
export function legPnl(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  type: "call" | "put",
  action: "buy" | "sell",
  entryPrice: number
): number {
  const currentPrice = bsPrice(spot, strike, dte, iv, type);
  const pnl = currentPrice - entryPrice;
  return action === "buy" ? pnl : -pnl;
}

/**
 * Calculate total structure P&L across all legs for a range of spot prices.
 * Returns array of { spot, pnl } points for charting.
 */
export function structurePayoff(
  legs: Array<{
    strike: number;
    iv: number;
    type: "call" | "put";
    action: "buy" | "sell";
    entryPrice: number;
  }>,
  spotPrice: number,
  dte: number,
  numPoints?: number
): Array<{ spot: number; pnl: number }> {
  const points = numPoints ?? 80;
  const minSpot = spotPrice * 0.85;
  const maxSpot = spotPrice * 1.15;
  const step = (maxSpot - minSpot) / points;
  const result: Array<{ spot: number; pnl: number }> = [];

  for (let s = minSpot; s <= maxSpot; s += step) {
    let totalPnl = 0;
    for (const leg of legs) {
      totalPnl += legPnl(s, leg.strike, dte, leg.iv, leg.type, leg.action, leg.entryPrice);
    }
    result.push({ spot: Number(s.toFixed(2)), pnl: Number((totalPnl * 100).toFixed(2)) });
  }

  return result;
}
