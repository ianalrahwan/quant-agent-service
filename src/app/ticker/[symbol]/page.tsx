"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { HeaderBar } from "@/components/bloomberg/HeaderBar";
import { FunctionBar } from "@/components/bloomberg/FunctionBar";
import { Panel } from "@/components/bloomberg/Panel";
import { InfoTooltip } from "@/components/bloomberg/InfoTooltip";
import { SignalSummary } from "@/components/detail/SignalSummary";
import { TermStructureChart } from "@/components/detail/TermStructure";
import { SkewChart } from "@/components/detail/SkewChart";
import { VolSurface } from "@/components/detail/VolSurface";
import { KurtosisChart } from "@/components/detail/KurtosisChart";
import { MacroIVChart } from "@/components/detail/MacroIVChart";
import { useKeyboard } from "@/hooks/useKeyboard";
import type {
  QuoteData,
  OptionsChainData,
  VixTermStructure,
  ScanResult,
  HistoricalBar,
} from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TickerDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const router = useRouter();
  const [tickerInput, setTickerInput] = useState("");

  const { data: quote } = useSWR<QuoteData>(`/api/quote/${symbol}`, fetcher);
  const { data: chain } = useSWR<OptionsChainData>(`/api/options/${symbol}`, fetcher);
  const { data: history } = useSWR<HistoricalBar[]>(`/api/historical/${symbol}`, fetcher);
  const { data: vixData } = useSWR<VixTermStructure>("/api/vix", fetcher);
  const { data: scanResults } = useSWR<ScanResult[]>("/api/scanner", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: macroData } = useSWR<Record<string, HistoricalBar[]>>(
    "/api/macro",
    fetcher,
    { revalidateOnFocus: false }
  );

  const scanResult = scanResults?.find((r) => r.symbol === symbol);

  const navigateToDetail = useCallback(
    (sym: string) => router.push(`/ticker/${sym}`),
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

  useKeyboard({ onEscape: () => router.push("/") });

  const spotPrice = quote?.price ?? 0;
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
        dataTimestamp={scanResult?.timestamp}
      />

      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bb-gray bg-bb-darkgray">
        <div className="flex items-center gap-3">
          <span className="text-bb-amber font-bold text-[20px]">{symbol}</span>
          {quote && (
            <>
              <span className="text-bb-white text-[13px]">{quote.name}</span>
              <span className="text-bb-brightwhite text-[16px] font-bold">
                ${(quote.price ?? 0).toFixed(2)}
              </span>
              <span
                className={`text-[14px] font-bold ${(quote.changePct ?? 0) >= 0 ? "text-bb-green" : "text-bb-red"}`}
              >
                {(quote.changePct ?? 0) >= 0 ? "+" : ""}
                {(quote.changePct ?? 0).toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleTickerSubmit} className="flex items-center gap-2">
            <span className="text-bb-amber text-[12px] font-bold">SWITCH:</span>
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder="TICKER ⏎"
              className="w-[120px] bg-bb-black border border-bb-amber text-bb-brightwhite text-[14px] font-mono font-bold px-2 py-1 outline-none focus:border-bb-brightwhite placeholder:text-bb-white/40 placeholder:font-normal"
            />
          </form>
          <button
            onClick={() => router.push("/")}
            className="text-bb-brightwhite hover:text-bb-amber text-[12px] font-bold border border-bb-amber px-3 py-1 hover:bg-bb-amber/10"
          >
            ← SCANNER
          </button>
        </div>
      </div>

      {/* Main layout: left sidebar (signals) + right panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Signal Summary */}
        <div className="w-[320px] border-r border-bb-gray overflow-auto shrink-0">
          <Panel title="Signal Analysis">
            {scanResult ? (
              <SignalSummary
                criteria={scanResult.criteria}
                compositeScore={scanResult.compositeScore}
              />
            ) : (
              <div className="text-bb-white/40 text-[11px] animate-pulse">
                Loading signal data...
              </div>
            )}
          </Panel>
        </div>

        {/* Right: Visualizations */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top row: Macro IV Chart (taller, fixed height) */}
          <div className="border-b border-bb-gray overflow-auto" style={{ minHeight: "280px" }}>
            <Panel title={
              <>
                <span>Macro Overlay & IV Percentile</span>
                <InfoTooltip
                  quote="You want to see how the vol regime of your ticker relates to what's happening in the broader macro landscape. When commodities spike on geopolitical risk and your ticker's IV percentile is still low, that's a dislocation — the market hasn't priced the contagion yet."
                />
              </>
            }>
              {history && history.length > 0 ? (
                <MacroIVChart
                  tickerSymbol={symbol}
                  tickerHistory={history}
                  macroData={macroData ?? {}}
                  chain={chain ?? null}
                  spotPrice={spotPrice}
                />
              ) : (
                <div className="text-bb-white/40 text-[11px] animate-pulse">
                  Loading chart data...
                </div>
              )}
            </Panel>
          </div>

          {/* Middle row: Term Structure + Skew */}
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 border-r border-b border-bb-gray overflow-auto">
              <Panel title={
                <>
                  <span>{["SPY","QQQ","IWM","DIA"].includes(symbol) ? "VIX" : symbol} Term Structure</span>
                  <InfoTooltip quote="The term structure tells you everything about how the market is pricing risk across time. When near-term vol trades above longer-term vol, the market is saying: the danger is NOW, not later. That's backwardation — and it's when convexity is most valuable." />
                </>
              }>
                <TermStructureChart
                  vixData={vixData ?? null}
                  chain={chain ?? null}
                  spotPrice={spotPrice}
                  isIndex={["SPY", "QQQ", "IWM", "DIA", "EFA", "EEM"].includes(symbol)}
                />
              </Panel>
            </div>
            <div className="flex-1 border-b border-bb-gray overflow-auto">
              <Panel title="IV Skew">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-bb-amber text-[11px] font-bold">IMPLIED VOL SKEW</span>
                  <InfoTooltip quote="Skew is the market's way of telling you it doesn't believe in the normal distribution. When put skew is steep, the market is pricing in fat tails — it's saying the probability of a large down move is much higher than Black-Scholes assumes. That's where the edge is." />
                </div>
                {chain && spotPrice > 0 ? (
                  <SkewChart
                    calls={Object.values(chain.chains)[0]?.calls ?? []}
                    puts={Object.values(chain.chains)[0]?.puts ?? []}
                    spotPrice={spotPrice}
                  />
                ) : (
                  <div className="text-bb-white/40 text-[11px] animate-pulse">Loading options data...</div>
                )}
              </Panel>
            </div>
          </div>

          {/* Bottom row: Kurtosis + Vol Surface */}
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 border-r border-bb-gray overflow-auto">
              <Panel title="Return Distribution">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-bb-amber text-[11px] font-bold">KURTOSIS &amp; FAT TAILS</span>
                  <InfoTooltip
                    quote="The entire edifice of modern finance is built on the assumption that returns are normally distributed. They are not. The real world has fat tails — events that models say should happen once in ten thousand years happen every few years. That's where the risk — and the opportunity — lives."
                    attribution="— Nassim Taleb"
                  />
                </div>
                {history && history.length > 0 ? (
                  <KurtosisChart history={history} />
                ) : (
                  <div className="text-bb-white/40 text-[11px] animate-pulse">Loading historical data...</div>
                )}
              </Panel>
            </div>
            <div className="flex-1 overflow-auto">
              <Panel title="Vol Surface">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-bb-amber text-[11px] font-bold">VOLATILITY SURFACE</span>
                  <InfoTooltip quote="The vol surface is a map of implied volatility across strikes and expirations. Each cell shows what the market is charging for options at that strike and date. Cool colors (blue) mean cheap vol, warm colors (red) mean expensive. You want to buy convexity where the surface is cool — that's where the market is underpricing risk." />
                </div>
                {chain && spotPrice > 0 ? (
                  <VolSurface chain={chain} spotPrice={spotPrice} />
                ) : (
                  <div className="text-bb-white/40 text-[11px] animate-pulse">Loading surface data...</div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>

      <FunctionBar
        keys={[
          { key: "ESC", label: "SCANNER", action: () => router.push("/") },
        ]}
      />
    </div>
  );
}
