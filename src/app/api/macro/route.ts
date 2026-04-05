import { NextResponse } from "next/server";
import { getHistoricalPrices } from "@/lib/yahoo";
import { cacheGet, cacheSet, TTL } from "@/lib/cache";
import type { HistoricalBar } from "@/lib/types";

const MACRO_SYMBOLS = ["USO", "UNG", "GLD", "ITA", "FXI", "SPY", "^VIX"];

export async function GET() {
  const cacheKey = "macro:basket";
  const cached = cacheGet<Record<string, HistoricalBar[]>>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
    });
  }

  const results: Record<string, HistoricalBar[]> = {};

  const entries = await Promise.all(
    MACRO_SYMBOLS.map(async (sym) => {
      try {
        const bars = await getHistoricalPrices(sym);
        return [sym, bars] as const;
      } catch {
        return [sym, [] as HistoricalBar[]] as const;
      }
    })
  );

  for (const [sym, bars] of entries) {
    if (bars.length > 0) {
      results[sym] = bars;
    }
  }

  cacheSet(cacheKey, results, TTL.HISTORICAL);

  return NextResponse.json(results, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
  });
}
