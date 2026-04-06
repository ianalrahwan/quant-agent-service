"use client";

import type { TradeRecommendation } from "@/lib/agent-types";
import type { OptionsChainData, OptionContract } from "@/lib/types";

export interface MatchedLeg {
  action: "buy" | "sell";
  strike: number;
  type: "call" | "put";
  expiry: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  iv: number | null;
  estimated: boolean;
}

interface TradeRecDetailProps {
  rec: TradeRecommendation;
  chain: OptionsChainData | null;
  spotPrice: number;
}

/** Find the expiry in the chain closest to the target expiry string. */
function closestExpiry(target: string, expirations: string[]): string {
  if (expirations.length === 0) return target;
  const targetMs = new Date(target).getTime();
  let best = expirations[0];
  let bestDiff = Math.abs(new Date(best).getTime() - targetMs);
  for (const exp of expirations) {
    const diff = Math.abs(new Date(exp).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = exp;
    }
  }
  return best;
}

/** Match each rec leg to the closest contract in the chain. */
export function matchLegs(
  rec: TradeRecommendation,
  chain: OptionsChainData | null
): MatchedLeg[] {
  return rec.legs.map((leg) => {
    const action = (leg.action === "buy" ? "buy" : "sell") as "buy" | "sell";
    const type = (leg.type === "call" ? "call" : "put") as "call" | "put";

    if (!chain || chain.expirations.length === 0) {
      return {
        action,
        strike: leg.strike,
        type,
        expiry: leg.expiry,
        bid: null,
        ask: null,
        mid: null,
        iv: null,
        estimated: true,
      };
    }

    const expiry = closestExpiry(leg.expiry, chain.expirations);
    const bucket = chain.chains[expiry];
    const contracts: OptionContract[] = bucket
      ? type === "call"
        ? bucket.calls
        : bucket.puts
      : [];

    // Find closest strike
    let best: OptionContract | null = null;
    let bestDiff = Infinity;
    for (const c of contracts) {
      const diff = Math.abs(c.strike - leg.strike);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }

    if (!best) {
      return {
        action,
        strike: leg.strike,
        type,
        expiry,
        bid: null,
        ask: null,
        mid: null,
        iv: null,
        estimated: true,
      };
    }

    const bid = best.bid > 0 ? best.bid : null;
    const ask = best.ask > 0 ? best.ask : null;
    const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;

    return {
      action,
      strike: best.strike,
      type,
      expiry,
      bid,
      ask,
      mid,
      iv: best.impliedVolatility > 0 ? best.impliedVolatility : null,
      estimated: false,
    };
  });
}

function fmt(v: number | null, digits = 2): string {
  return v !== null ? `$${v.toFixed(digits)}` : "—";
}

export function TradeRecDetail({ rec, chain, spotPrice: _spotPrice }: TradeRecDetailProps) {
  const legs = matchLegs(rec, chain);

  // Net debit/credit: buy legs cost money (positive debit), sell legs receive credit (negative)
  let netMid: number | null = null;
  let allHaveMid = true;
  for (const leg of legs) {
    if (leg.mid === null) { allHaveMid = false; break; }
  }
  if (allHaveMid) {
    netMid = legs.reduce((acc, leg) => {
      const mid = leg.mid!;
      return acc + (leg.action === "buy" ? mid : -mid);
    }, 0);
  }

  const isDebit = netMid !== null && netMid > 0;
  const isCredit = netMid !== null && netMid < 0;

  // Max loss: for debit spreads = net debit; for credit spreads = spread width - credit
  // Simplified: show net debit as max loss for debit, N/A for credit (complex)
  const maxLoss: string =
    netMid !== null
      ? isDebit
        ? `${fmt(netMid * 100)} per contract`
        : `${fmt(Math.abs(netMid) * 100)} credit received`
      : "—";

  return (
    <div className="font-mono text-xs mt-3 border-t border-bb-gray pt-3 flex flex-col gap-3">
      {/* Pricing table */}
      <div>
        <div className="text-bb-amber uppercase text-[10px] tracking-wider mb-1">
          Live Pricing
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-bb-gray text-[10px] border-b border-bb-gray">
              <th className="text-left py-0.5 pr-2 font-normal">Leg</th>
              <th className="text-right py-0.5 px-2 font-normal">Bid</th>
              <th className="text-right py-0.5 px-2 font-normal">Ask</th>
              <th className="text-right py-0.5 px-2 font-normal">Mid</th>
              <th className="text-right py-0.5 pl-2 font-normal">IV</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr key={i} className="border-b border-bb-gray/30">
                <td className="py-0.5 pr-2">
                  <span className={leg.action === "buy" ? "text-bb-green" : "text-bb-red"}>
                    {leg.action.toUpperCase()}
                  </span>{" "}
                  <span className="text-bb-white">
                    {leg.strike} {leg.type.toUpperCase()}
                  </span>
                  {leg.estimated && (
                    <span className="text-bb-gray ml-1">(est)</span>
                  )}
                </td>
                <td className="text-right py-0.5 px-2 text-bb-white">{fmt(leg.bid)}</td>
                <td className="text-right py-0.5 px-2 text-bb-white">{fmt(leg.ask)}</td>
                <td className="text-right py-0.5 px-2 text-bb-amber font-bold">{fmt(leg.mid)}</td>
                <td className="text-right py-0.5 pl-2 text-bb-gray">
                  {leg.iv !== null ? `${(leg.iv * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Net debit / credit summary */}
        <div className="flex justify-between mt-2 pt-1 border-t border-bb-gray">
          <span className="text-bb-gray">
            Net {isDebit ? "Debit" : isCredit ? "Credit" : "Cost"}
          </span>
          <span className={isDebit ? "text-bb-red" : isCredit ? "text-bb-green" : "text-bb-white"}>
            {netMid !== null ? `${fmt(Math.abs(netMid))} / contract` : "—"}
          </span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-bb-gray">Max Loss</span>
          <span className="text-bb-white">{maxLoss}</span>
        </div>
      </div>

      {/* Rationale */}
      <div>
        <div className="text-bb-amber uppercase text-[10px] tracking-wider mb-1">
          Rationale
        </div>
        <div className="text-bb-white/80 leading-relaxed">{rec.rationale}</div>
      </div>

      {/* Risk / Reward */}
      <div>
        <div className="text-bb-amber uppercase text-[10px] tracking-wider mb-1">
          Risk / Reward
        </div>
        <div className="text-bb-white/80">{rec.risk_reward}</div>
      </div>

      {/* Greeks */}
      <div className="flex gap-6 text-bb-white border-t border-bb-gray pt-2">
        <div>
          <div className="text-bb-gray text-[10px]">DELTA</div>
          <div className="text-bb-white">{rec.estimated_greeks.delta?.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-bb-gray text-[10px]">VEGA</div>
          <div className="text-bb-white">{rec.estimated_greeks.vega?.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-bb-gray text-[10px]">THETA</div>
          <div className="text-bb-white">{rec.estimated_greeks.theta?.toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}
