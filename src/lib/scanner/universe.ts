/**
 * Scanner ticker universe — liquid options across equities and commodities.
 */

export interface UniverseEntry {
  symbol: string;
  name: string;
  sector: "index" | "equity" | "commodity" | "sector" | "volatility";
}

export const SCANNER_UNIVERSE: UniverseEntry[] = [
  // Equity indices / ETFs
  { symbol: "SPY", name: "S&P 500 ETF", sector: "index" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", sector: "index" },
  { symbol: "IWM", name: "Russell 2000 ETF", sector: "index" },
  { symbol: "DIA", name: "Dow Jones ETF", sector: "index" },
  { symbol: "EFA", name: "EAFE Intl ETF", sector: "index" },
  { symbol: "EEM", name: "Emerging Mkts ETF", sector: "index" },

  // Mega-cap with liquid options
  { symbol: "AAPL", name: "Apple", sector: "equity" },
  { symbol: "MSFT", name: "Microsoft", sector: "equity" },
  { symbol: "AMZN", name: "Amazon", sector: "equity" },
  { symbol: "GOOGL", name: "Alphabet", sector: "equity" },
  { symbol: "TSLA", name: "Tesla", sector: "equity" },
  { symbol: "NVDA", name: "NVIDIA", sector: "equity" },
  { symbol: "META", name: "Meta Platforms", sector: "equity" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "equity" },
  { symbol: "BAC", name: "Bank of America", sector: "equity" },
  { symbol: "GS", name: "Goldman Sachs", sector: "equity" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "equity" },
  { symbol: "CVX", name: "Chevron", sector: "equity" },

  // Commodity ETFs
  { symbol: "GLD", name: "Gold ETF", sector: "commodity" },
  { symbol: "SLV", name: "Silver ETF", sector: "commodity" },
  { symbol: "USO", name: "US Oil Fund", sector: "commodity" },
  { symbol: "UNG", name: "US Natural Gas", sector: "commodity" },
  { symbol: "DBA", name: "Agriculture ETF", sector: "commodity" },
  { symbol: "WEAT", name: "Wheat ETF", sector: "commodity" },
  { symbol: "CORN", name: "Corn ETF", sector: "commodity" },

  // Sector ETFs
  { symbol: "XLE", name: "Energy Select", sector: "sector" },
  { symbol: "XLF", name: "Financial Select", sector: "sector" },
  { symbol: "XLK", name: "Technology Select", sector: "sector" },
  { symbol: "XLV", name: "Healthcare Select", sector: "sector" },
  { symbol: "XLU", name: "Utilities Select", sector: "sector" },
  { symbol: "XLI", name: "Industrial Select", sector: "sector" },
  { symbol: "XLB", name: "Materials Select", sector: "sector" },

  // High-vol names
  { symbol: "COIN", name: "Coinbase", sector: "equity" },
  { symbol: "MARA", name: "Marathon Digital", sector: "equity" },
  { symbol: "RIVN", name: "Rivian", sector: "equity" },
  { symbol: "ARM", name: "ARM Holdings", sector: "equity" },
];
