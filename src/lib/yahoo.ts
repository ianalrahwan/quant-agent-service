/**
 * Yahoo Finance data fetcher wrapping yahoo-finance2.
 * All market data flows through this module.
 *
 * Note: yahoo-finance2 types use complex overloads that resolve to `never`
 * in some configurations. We cast at the boundary since this is external data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
import { cacheGet, cacheSet, TTL } from "./cache";
import type {
  OptionsChainData,
  OptionContract,
  HistoricalBar,
  QuoteData,
} from "./types";

/**
 * Fetch current quote for a symbol.
 */
export async function getQuote(symbol: string): Promise<QuoteData | null> {
  const cacheKey = `quote:${symbol}`;
  const cached = cacheGet<QuoteData>(cacheKey);
  if (cached) return cached;

  try {
    const result: any = await yahooFinance.quote(symbol);
    const data: QuoteData = {
      symbol: result.symbol,
      name: result.shortName ?? result.longName ?? symbol,
      price: result.regularMarketPrice ?? 0,
      change: result.regularMarketChange ?? 0,
      changePct: result.regularMarketChangePercent ?? 0,
      volume: result.regularMarketVolume ?? 0,
      marketCap: result.marketCap ?? undefined,
    };
    cacheSet(cacheKey, data, TTL.QUOTE);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch quotes for multiple symbols (batched).
 */
export async function getQuotes(
  symbols: string[]
): Promise<Map<string, QuoteData>> {
  const results = new Map<string, QuoteData>();
  const toFetch: string[] = [];

  for (const sym of symbols) {
    const cached = cacheGet<QuoteData>(`quote:${sym}`);
    if (cached) {
      results.set(sym, cached);
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length > 0) {
    try {
      const raw: any = await yahooFinance.quote(toFetch);
      const quotesArray: any[] = Array.isArray(raw) ? raw : [raw];
      for (const q of quotesArray) {
        const data: QuoteData = {
          symbol: q.symbol,
          name: q.shortName ?? q.longName ?? q.symbol,
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePct: q.regularMarketChangePercent ?? 0,
          volume: q.regularMarketVolume ?? 0,
          marketCap: q.marketCap ?? undefined,
        };
        cacheSet(`quote:${q.symbol}`, data, TTL.QUOTE);
        results.set(q.symbol, data);
      }
    } catch {
      // partial failure — return what we have
    }
  }

  return results;
}

/**
 * Fetch options chain for a symbol.
 * Fetches the nearest 2-3 expiration dates.
 */
export async function getOptionsChain(
  symbol: string
): Promise<OptionsChainData | null> {
  const cacheKey = `options:${symbol}`;
  const cached = cacheGet<OptionsChainData>(cacheKey);
  if (cached) return cached;

  try {
    const initial: any = await yahooFinance.options(symbol);
    const expirations: string[] =
      initial.expirationDates?.map((d: Date) =>
        d.toISOString().split("T")[0]
      ) ?? [];

    const chains: OptionsChainData["chains"] = {};

    const datesToFetch = expirations.slice(0, 7);
    for (const dateStr of datesToFetch) {
      const chainData: any = await yahooFinance.options(symbol, {
        date: new Date(dateStr),
      });

      const rawCalls: any[] = chainData.options?.[0]?.calls ?? [];
      const rawPuts: any[] = chainData.options?.[0]?.puts ?? [];

      const calls: OptionContract[] = rawCalls.map((c) => ({
        strike: c.strike ?? 0,
        expiration: dateStr,
        type: "call" as const,
        lastPrice: c.lastPrice ?? 0,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        impliedVolatility: c.impliedVolatility ?? 0,
      }));

      const puts: OptionContract[] = rawPuts.map((p) => ({
        strike: p.strike ?? 0,
        expiration: dateStr,
        type: "put" as const,
        lastPrice: p.lastPrice ?? 0,
        bid: p.bid ?? 0,
        ask: p.ask ?? 0,
        volume: p.volume ?? 0,
        openInterest: p.openInterest ?? 0,
        impliedVolatility: p.impliedVolatility ?? 0,
      }));

      chains[dateStr] = { calls, puts };
    }

    const data: OptionsChainData = { symbol, expirations, chains };
    cacheSet(cacheKey, data, TTL.OPTIONS);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch 1 year of daily historical prices.
 */
export async function getHistoricalPrices(
  symbol: string
): Promise<HistoricalBar[]> {
  const cacheKey = `historical:${symbol}`;
  const cached = cacheGet<HistoricalBar[]>(cacheKey);
  if (cached) return cached;

  try {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result: any = await yahooFinance.chart(symbol, {
      period1: oneYearAgo,
      period2: now,
      interval: "1d",
    });

    const bars: HistoricalBar[] = (result.quotes ?? []).map((q: any) => ({
      date:
        q.date instanceof Date
          ? q.date.toISOString().split("T")[0]
          : String(q.date),
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));

    cacheSet(cacheKey, bars, TTL.HISTORICAL);
    return bars;
  } catch {
    return [];
  }
}
