"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { HeaderBar } from "@/components/bloomberg/HeaderBar";
import { TickerTape } from "@/components/bloomberg/TickerTape";
import { FunctionBar } from "@/components/bloomberg/FunctionBar";
import { Panel } from "@/components/bloomberg/Panel";
import { ScannerTable } from "@/components/scanner/ScannerTable";
import { CriteriaBreakdown } from "@/components/scanner/CriteriaBreakdown";
import { FilterControls } from "@/components/scanner/FilterControls";
import { useKeyboard } from "@/hooks/useKeyboard";
import type { ScanResult, VixTermStructure, CriterionResult } from "@/lib/types";
import { signalFromScore } from "@/lib/types";
import { SCANNER_UNIVERSE } from "@/lib/scanner/universe";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SECTOR_MAP: Record<string, string[]> = {
  index: ["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM"],
  commodity: ["GLD", "SLV", "USO", "UNG", "DBA", "WEAT", "CORN"],
  sector: ["XLE", "XLF", "XLK", "XLV", "XLU", "XLI", "XLB"],
};
const ALL_NON_EQUITY = Object.values(SECTOR_MAP).flat();

export default function ScannerPage() {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [termFilter, setTermFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [tickerInput, setTickerInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  interface BackendScannerResult {
    symbol: string;
    scores: {
      iv_percentile: number;
      skew_kurtosis: number;
      dealer_gamma: number;
      term_structure: number;
      vanna: number;
      charm: number;
      composite: number;
    };
    composite: number;
    created_at: string;
  }

  const { data: scanScores, isLoading: scoresLoading, mutate } = useSWR<BackendScannerResult[]>(
    "/api/scanner",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120_000 }
  );

  const symbolsList = useMemo(
    () => (scanScores ?? []).map((r) => r.symbol).join(","),
    [scanScores]
  );

  const { data: quotes } = useSWR<Record<string, { price: number; change: number; changePct: number; name: string }>>(
    symbolsList ? `/api/quotes?symbols=${symbolsList}` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  );

  const isLoading = scoresLoading;

  const { data: vixData } = useSWR<VixTermStructure>("/api/vix", fetcher, {
    refreshInterval: 60_000,
  });

  const results: ScanResult[] = useMemo(() => {
    if (!scanScores) return [];

    function criterion(score: number): CriterionResult {
      return {
        score,
        rawValue: score,
        label: score >= 0.75 ? "Elevated" : score >= 0.5 ? "Moderate" : score >= 0.25 ? "Low" : "Flat",
        signal: signalFromScore(score),
      };
    }

    return scanScores.map((r) => {
      const q = quotes?.[r.symbol];
      const entry = SCANNER_UNIVERSE.find((u) => u.symbol === r.symbol);

      return {
        symbol: r.symbol,
        name: q?.name ?? entry?.name ?? r.symbol,
        lastPrice: q?.price ?? 0,
        change: q?.change ?? 0,
        changePct: q?.changePct ?? 0,
        compositeScore: r.composite,
        criteria: {
          ivPercentile: criterion(r.scores.iv_percentile),
          skewKurtosis: criterion(r.scores.skew_kurtosis),
          dealerGamma: criterion(r.scores.dealer_gamma),
          termStructure: criterion(r.scores.term_structure),
          vanna: criterion(r.scores.vanna),
          charm: criterion(r.scores.charm),
        },
        timestamp: new Date(r.created_at).getTime(),
      };
    });
  }, [scanScores, quotes]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (sectorFilter !== "all") {
        if (sectorFilter === "equity") {
          if (ALL_NON_EQUITY.includes(r.symbol)) return false;
        } else {
          const syms = SECTOR_MAP[sectorFilter];
          if (syms && !syms.includes(r.symbol)) return false;
        }
      }
      if (r.compositeScore * 100 < minScore) return false;
      // Term structure filter: backwardation = score > 0.5, contango = score <= 0.5
      if (termFilter === "backwardation" && r.criteria.termStructure.score <= 0.5) return false;
      if (termFilter === "contango" && r.criteria.termStructure.score > 0.5) return false;
      // Signal filter
      if (signalFilter === "strong") {
        if (r.criteria.ivPercentile.signal !== "strong" &&
            r.criteria.dealerGamma.signal !== "strong" &&
            r.criteria.termStructure.signal !== "strong") return false;
      }
      if (signalFilter === "moderate") {
        const hasSignal = Object.values(r.criteria).some(
          (c) => c.signal === "strong" || c.signal === "moderate"
        );
        if (!hasSignal) return false;
      }
      return true;
    });
  }, [results, sectorFilter, minScore, termFilter, signalFilter]);

  const selectedResult = filtered[selectedIndex] ?? null;

  const navigateToDetail = useCallback(
    (symbol: string) => {
      router.push(`/ticker/${symbol}`);
    },
    [router]
  );

  const handleTickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tickerInput.trim().toUpperCase();
    if (trimmed) {
      navigateToDetail(trimmed);
      setTickerInput("");
    }
  };

  useKeyboard({
    onArrowUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    onArrowDown: () =>
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1)),
    onEnter: () => {
      if (selectedResult) navigateToDetail(selectedResult.symbol);
    },
    onEscape: () => setSelectedIndex(0),
    onF2: () => mutate(),
    onF3: () => setShowFilters((s) => !s),
  });

  const tickerTapeItems = results.slice(0, 20).map((r) => ({
    symbol: r.symbol,
    price: r.lastPrice,
    change: r.change,
  }));

  const isMarketOpen = (() => {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    return day >= 1 && day <= 5 && hour >= 14 && hour < 21;
  })();

  return (
    <div className="flex flex-col h-full bg-bb-black">
      <HeaderBar
        vixLevel={vixData?.vix}
        marketOpen={isMarketOpen}
        dataTimestamp={results[0]?.timestamp}
      />
      <TickerTape items={tickerTapeItems} />

      {/* Prominent ticker input */}
      <div className="border-b border-bb-gray bg-bb-darkgray px-4 py-3">
        <form onSubmit={handleTickerSubmit} className="flex items-center gap-3">
          <span className="text-bb-amber font-bold text-[13px]">GO TO TICKER:</span>
          <div className="flex-1 max-w-[300px] relative">
            <input
              ref={inputRef}
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder="SPY, AAPL, GLD..."
              className="w-full bg-bb-black border border-bb-amber text-bb-brightwhite text-[15px] font-mono font-bold px-3 py-2 outline-none focus:border-bb-brightwhite placeholder:text-bb-white/50 placeholder:font-normal"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-bb-amber text-[11px] font-bold">
              ENTER ⏎
            </span>
          </div>
          <span className="text-bb-white text-[12px]">
            Type any ticker symbol and press Enter for detailed vol analysis
          </span>
        </form>
      </div>

      {showFilters && (
        <FilterControls
          sectorFilter={sectorFilter}
          onSectorChange={setSectorFilter}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          termFilter={termFilter}
          onTermFilterChange={setTermFilter}
          signalFilter={signalFilter}
          onSignalFilterChange={setSignalFilter}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Panel title="Long Vol Scanner" className="h-full">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-bb-amber text-[14px] animate-pulse">
                  ▓▓▓▓▓▓▓▓░░░░ SCANNING SYMBOLS...
                </div>
                <div className="text-bb-gray text-[11px]">
                  Fetching options data for ~36 symbols. This may take a minute.
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-bb-gray">
                  {results.length === 0
                    ? "Scanner loading — data will appear shortly"
                    : "No results match current filters"}
                </div>
                <div className="text-bb-amber text-[12px]">
                  Type a ticker above to view any symbol directly
                </div>
              </div>
            ) : (
              <ScannerTable
                results={filtered}
                selectedIndex={selectedIndex}
                onSelectRow={setSelectedIndex}
              />
            )}
          </Panel>
        </div>

        {selectedResult && (
          <div className="w-[340px] border-l border-bb-gray overflow-auto">
            <Panel title={`${selectedResult.symbol} Breakdown`}>
              <div className="mb-3">
                <span className="text-bb-amber font-bold text-[16px]">
                  {selectedResult.symbol}
                </span>{" "}
                <span className="text-bb-white text-[12px]">
                  {selectedResult.name}
                </span>
                <div className="mt-1 text-[12px]">
                  <span className="text-bb-white">
                    ${selectedResult.lastPrice.toFixed(2)}
                  </span>{" "}
                  <span
                    className={
                      selectedResult.changePct >= 0
                        ? "text-bb-green"
                        : "text-bb-red"
                    }
                  >
                    {selectedResult.changePct >= 0 ? "+" : ""}
                    {selectedResult.changePct.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="mb-3 text-[12px]">
                <span className="text-bb-amber">Composite: </span>
                <span className="text-bb-brightwhite font-bold text-[14px]">
                  {(selectedResult.compositeScore * 100).toFixed(1)}
                </span>
              </div>
              <CriteriaBreakdown criteria={selectedResult.criteria} />
              <div className="mt-3 pt-2 border-t border-bb-gray text-[10px] text-bb-gray">
                Press ENTER or click row for full detail view
              </div>
            </Panel>
          </div>
        )}
      </div>

      <FunctionBar
        keys={[
          { key: "F2", label: "SCAN", action: () => mutate() },
          {
            key: "F3",
            label: "FILTER",
            action: () => setShowFilters((s) => !s),
          },
          { key: "↑↓", label: "NAV" },
          { key: "⏎", label: "DETAIL" },
        ]}
      />
    </div>
  );
}
