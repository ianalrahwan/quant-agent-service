/**
 * Scanner engine: orchestrates data fetching and scoring across the universe.
 */

import type { ScanResult, CriteriaScores, VixTermStructure } from "../types";
import { getQuote, getOptionsChain, getHistoricalPrices } from "../yahoo";
import { getVixTermStructure } from "../cboe";
import {
  scoreIVPercentile,
  scoreSkewKurtosis,
  scoreDealerGamma,
  scoreTermStructure,
  scoreVanna,
  scoreCharm,
} from "./criteria";
import { computeCompositeScore } from "./composite";
import { SCANNER_UNIVERSE } from "./universe";

const DELAY_MS = 50; // Delay between symbols to avoid rate limiting
const INDEX_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a full scan across the universe.
 * Returns results sorted by composite score descending.
 */
export async function runScan(): Promise<ScanResult[]> {
  // Fetch VIX term structure first (shared across all symbols)
  const vixData = await getVixTermStructure();

  const results: ScanResult[] = [];

  for (const entry of SCANNER_UNIVERSE) {
    try {
      const result = await scanSymbol(entry.symbol, entry.name, vixData);
      if (result) {
        results.push(result);
      }
    } catch {
      // Skip symbols that fail
    }

    await sleep(DELAY_MS);
  }

  // Sort by composite score descending
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  return results;
}

/**
 * Scan a single symbol and return its scored result.
 */
async function scanSymbol(
  symbol: string,
  name: string,
  vixData: VixTermStructure | null
): Promise<ScanResult | null> {
  // Fetch all data in parallel
  const [quote, chain, history] = await Promise.all([
    getQuote(symbol),
    getOptionsChain(symbol),
    getHistoricalPrices(symbol),
  ]);

  if (!quote || !chain) return null;

  const spotPrice = quote.price;
  if (spotPrice <= 0) return null;

  // Score all 6 criteria
  const criteria: CriteriaScores = {
    ivPercentile: scoreIVPercentile(chain, history, spotPrice),
    skewKurtosis: scoreSkewKurtosis(chain, history, spotPrice),
    dealerGamma: scoreDealerGamma(chain, spotPrice),
    termStructure: scoreTermStructure(
      chain,
      spotPrice,
      INDEX_SYMBOLS.includes(symbol) ? vixData : null
    ),
    vanna: scoreVanna(chain, spotPrice),
    charm: scoreCharm(chain, spotPrice),
  };

  const compositeScore = computeCompositeScore(criteria);

  return {
    symbol,
    name,
    lastPrice: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    compositeScore,
    criteria,
    timestamp: Date.now(),
  };
}
