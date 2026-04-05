"use client";

import type { OptionsChainData } from "@/lib/types";

interface VolSurfaceProps {
  chain: OptionsChainData;
  spotPrice: number;
}

export function VolSurface({ chain, spotPrice }: VolSurfaceProps) {
  const expirations = Object.keys(chain.chains).slice(0, 7);
  if (expirations.length === 0) {
    return <div className="text-bb-gray text-[11px]">No surface data</div>;
  }

  // Build a grid: rows = strikes (near ATM), cols = expirations
  const minStrike = spotPrice * 0.9;
  const maxStrike = spotPrice * 1.1;

  // Collect all unique strikes across expirations
  const strikeSet = new Set<number>();
  for (const exp of expirations) {
    const { calls } = chain.chains[exp];
    for (const c of calls) {
      if (c.strike >= minStrike && c.strike <= maxStrike && c.impliedVolatility > 0) {
        strikeSet.add(c.strike);
      }
    }
  }
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);

  if (strikes.length === 0) {
    return <div className="text-bb-gray text-[11px]">No surface data</div>;
  }

  // Build IV matrix
  const matrix: (number | null)[][] = strikes.map((strike) =>
    expirations.map((exp) => {
      const call = chain.chains[exp].calls.find((c) => c.strike === strike);
      return call?.impliedVolatility ?? null;
    })
  );

  // Color mapping: low IV = blue/cool, high IV = red/warm
  const allIVs = matrix.flat().filter((v): v is number => v !== null);
  const minIV = Math.min(...allIVs);
  const maxIV = Math.max(...allIVs);
  const range = maxIV - minIV || 0.01;

  function ivColor(iv: number): string {
    const t = (iv - minIV) / range;
    if (t < 0.33) return "bg-bb-blue/50 text-bb-brightwhite";
    if (t < 0.66) return "bg-bb-amber/40 text-bb-brightwhite";
    return "bg-bb-red/40 text-bb-brightwhite";
  }

  return (
    <div className="overflow-auto">
      <div className="text-[12px] text-bb-white mb-2">
        IV Surface — Call IV by Strike x Expiry
      </div>
      <table className="text-[12px] border-collapse">
        <thead>
          <tr>
            <th className="text-bb-amber px-2 py-1 text-right font-bold">Strike</th>
            {expirations.map((exp) => (
              <th key={exp} className="text-bb-amber px-2 py-1 text-center font-bold">
                {exp.slice(5)} {/* MM-DD */}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map((strike, i) => (
            <tr
              key={strike}
              className={
                Math.abs(strike - spotPrice) ===
                Math.min(...strikes.map((s) => Math.abs(s - spotPrice)))
                  ? "bg-bb-blue/10"
                  : ""
              }
            >
              <td className="text-bb-white px-2 py-1 text-right tabular-nums font-bold">
                {strike.toFixed(0)}
              </td>
              {matrix[i].map((iv, j) => (
                <td
                  key={j}
                  className={`px-2 py-1 text-center tabular-nums font-bold ${iv !== null ? ivColor(iv) : "text-bb-white/30"}`}
                >
                  {iv !== null ? (iv * 100).toFixed(1) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
