/**
 * CBOE VIX term structure data via Yahoo Finance quotes.
 * Yahoo carries all CBOE vol indices as quotable symbols.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
import { cacheGet, cacheSet, TTL } from "./cache";
import type { VixTermStructure } from "./types";

const VIX_SYMBOLS = ["^VIX", "^VIX9D", "^VIX3M", "^VIX6M", "^VIX1Y"];

/**
 * Fetch VIX term structure from CBOE indices.
 */
export async function getVixTermStructure(): Promise<VixTermStructure | null> {
  const cacheKey = "vix:termstructure";
  const cached = cacheGet<VixTermStructure>(cacheKey);
  if (cached) return cached;

  try {
    const raw: any = await yahooFinance.quote(VIX_SYMBOLS);
    const quotesArray: any[] = Array.isArray(raw) ? raw : [raw];
    const priceMap = new Map<string, number>();
    for (const q of quotesArray) {
      priceMap.set(q.symbol, q.regularMarketPrice ?? 0);
    }

    const vix = priceMap.get("^VIX") ?? 0;
    const vix3m = priceMap.get("^VIX3M") ?? 0;

    const data: VixTermStructure = {
      vix9d: priceMap.get("^VIX9D") ?? 0,
      vix,
      vix3m,
      vix6m: priceMap.get("^VIX6M") ?? 0,
      vix1y: priceMap.get("^VIX1Y") ?? 0,
      timestamp: Date.now(),
      isBackwardated: vix3m > 0 && vix / vix3m > 1.0,
      backwardationRatio: vix3m > 0 ? vix / vix3m : 1,
    };

    cacheSet(cacheKey, data, TTL.VIX);
    return data;
  } catch {
    return null;
  }
}
