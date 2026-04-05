"use client";

import type { OptionsChainData } from "@/lib/types";

interface VolSurfaceProps {
  chain: OptionsChainData;
  spotPrice: number;
}

function buildMatrix(
  chain: OptionsChainData,
  spotPrice: number,
  type: "calls" | "puts"
) {
  const expirations = Object.keys(chain.chains).slice(0, 7);
  const minStrike = spotPrice * 0.9;
  const maxStrike = spotPrice * 1.1;

  const strikeSet = new Set<number>();
  for (const exp of expirations) {
    const contracts = chain.chains[exp][type];
    for (const c of contracts) {
      if (c.strike >= minStrike && c.strike <= maxStrike && c.impliedVolatility > 0) {
        strikeSet.add(c.strike);
      }
    }
  }
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);

  const matrix: (number | null)[][] = strikes.map((strike) =>
    expirations.map((exp) => {
      const contract = chain.chains[exp][type].find((c) => c.strike === strike);
      return contract?.impliedVolatility ?? null;
    })
  );

  return { expirations, strikes, matrix };
}

function SurfaceTable({
  label,
  expirations,
  strikes,
  matrix,
  spotPrice,
  color,
}: {
  label: string;
  expirations: string[];
  strikes: number[];
  matrix: (number | null)[][];
  spotPrice: number;
  color: "green" | "red";
}) {
  const allIVs = matrix.flat().filter((v): v is number => v !== null);
  if (allIVs.length === 0) {
    return <div className="text-bb-white/30 text-[11px]">No {label} data</div>;
  }

  const minIV = Math.min(...allIVs);
  const maxIV = Math.max(...allIVs);
  const range = maxIV - minIV || 0.01;

  function ivColor(iv: number): string {
    const t = (iv - minIV) / range;
    if (color === "green") {
      if (t < 0.33) return "bg-bb-blue/50 text-bb-brightwhite";
      if (t < 0.66) return "bg-bb-green/30 text-bb-brightwhite";
      return "bg-bb-green/50 text-bb-brightwhite";
    }
    if (t < 0.33) return "bg-bb-blue/50 text-bb-brightwhite";
    if (t < 0.66) return "bg-bb-red/25 text-bb-brightwhite";
    return "bg-bb-red/45 text-bb-brightwhite";
  }

  const atmStrike = strikes.reduce((best, s) =>
    Math.abs(s - spotPrice) < Math.abs(best - spotPrice) ? s : best
  , strikes[0]);

  return (
    <div className="overflow-auto">
      <div className="text-[12px] text-bb-white mb-2">
        {label} IV by Strike x Expiry
      </div>
      <table className="text-[11px] border-collapse w-full">
        <thead>
          <tr>
            <th className="text-bb-amber px-2 py-1 text-right font-bold">Strike</th>
            {expirations.map((exp) => (
              <th key={exp} className="text-bb-amber px-1 py-1 text-center font-bold">
                {exp.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map((strike, i) => (
            <tr
              key={strike}
              className={strike === atmStrike ? "bg-bb-blue/10" : ""}
            >
              <td className="text-bb-white px-2 py-0.5 text-right tabular-nums font-bold">
                {strike.toFixed(0)}
              </td>
              {matrix[i].map((iv, j) => (
                <td
                  key={j}
                  className={`px-1 py-0.5 text-center tabular-nums font-bold ${iv !== null ? ivColor(iv) : "text-bb-white/30"}`}
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

export function VolSurface({ chain, spotPrice }: VolSurfaceProps) {
  const calls = buildMatrix(chain, spotPrice, "calls");
  const puts = buildMatrix(chain, spotPrice, "puts");

  if (calls.strikes.length === 0 && puts.strikes.length === 0) {
    return <div className="text-bb-white/30 text-[11px]">No surface data</div>;
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <SurfaceTable
          label="Call"
          expirations={calls.expirations}
          strikes={calls.strikes}
          matrix={calls.matrix}
          spotPrice={spotPrice}
          color="green"
        />
      </div>
      <div className="flex-1">
        <SurfaceTable
          label="Put"
          expirations={puts.expirations}
          strikes={puts.strikes}
          matrix={puts.matrix}
          spotPrice={spotPrice}
          color="red"
        />
      </div>
    </div>
  );
}
