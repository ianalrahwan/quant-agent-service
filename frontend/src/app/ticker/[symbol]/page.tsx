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
import { useKeyboard } from "@/hooks/useKeyboard";
import type {
  QuoteData,
  OptionsChainData,
  VixTermStructure,
  ScanResult,
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

  const { data: quote } = useSWR<QuoteData>(
    `/api/quote/${symbol}`,
    fetcher
  );
  const { data: chain } = useSWR<OptionsChainData>(
    `/api/options/${symbol}`,
    fetcher
  );
  const { data: vixData } = useSWR<VixTermStructure>("/api/vix", fetcher);
  const { data: scanResults } = useSWR<ScanResult[]>(
    "/api/scanner",
    fetcher,
    { revalidateOnFocus: false }
  );

  const scanResult = scanResults?.find((r) => r.symbol === symbol);

  const navigateToDetail = useCallback(
    (sym: string) => {
      router.push(`/ticker/${sym}`);
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
    onEscape: () => router.push("/"),
  });

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

      {/* Title bar with ticker input */}
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
            <span className="text-bb-gray text-[11px]">SWITCH:</span>
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder="TICKER ⏎"
              className="w-[100px] bg-bb-black border border-bb-gray text-bb-brightwhite text-[13px] font-mono font-bold px-2 py-1 outline-none focus:border-bb-amber placeholder:text-bb-gray placeholder:font-normal"
            />
          </form>
          <button
            onClick={() => router.push("/")}
            className="text-bb-gray hover:text-bb-orange text-[11px] border border-bb-gray px-2 py-1 hover:border-bb-orange"
          >
            ESC SCANNER
          </button>
        </div>
      </div>

      {/* Four-panel layout — larger visualizations */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 overflow-hidden">
        {/* Top-left: Signal Summary */}
        <div className="border-r border-b border-bb-gray overflow-auto">
          <Panel title="Signal Analysis">
            {scanResult ? (
              <SignalSummary
                criteria={scanResult.criteria}
                compositeScore={scanResult.compositeScore}
              />
            ) : (
              <div className="text-bb-gray text-[11px] animate-pulse">
                Loading signal data...
              </div>
            )}
          </Panel>
        </div>

        {/* Top-right: Term Structure */}
        <div className="border-b border-bb-gray overflow-auto">
          <Panel title="Term Structure">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-bb-amber text-[11px] font-bold">VIX TERM STRUCTURE</span>
              <InfoTooltip
                quote="The term structure tells you everything about how the market is pricing risk across time. When near-term vol trades above longer-term vol, the market is saying: the danger is NOW, not later. That's backwardation — and it's when convexity is most valuable."
              />
            </div>
            <TermStructureChart vixData={vixData ?? null} />
          </Panel>
        </div>

        {/* Bottom-left: Skew Chart */}
        <div className="border-r border-bb-gray overflow-auto">
          <Panel title="IV Skew">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-bb-amber text-[11px] font-bold">IMPLIED VOL SKEW</span>
              <InfoTooltip
                quote="Skew is the market's way of telling you it doesn't believe in the normal distribution. When put skew is steep, the market is pricing in fat tails — it's saying the probability of a large down move is much higher than Black-Scholes assumes. That's where the edge is."
              />
            </div>
            {chain && spotPrice > 0 ? (
              <SkewChart
                calls={Object.values(chain.chains)[0]?.calls ?? []}
                puts={Object.values(chain.chains)[0]?.puts ?? []}
                spotPrice={spotPrice}
              />
            ) : (
              <div className="text-bb-gray text-[11px] animate-pulse">
                Loading options data...
              </div>
            )}
          </Panel>
        </div>

        {/* Bottom-right: Vol Surface */}
        <div className="overflow-auto">
          <Panel title="Vol Surface">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-bb-amber text-[11px] font-bold">VOLATILITY SURFACE</span>
              <InfoTooltip
                quote="The vol surface is a map of implied volatility across strikes and expirations. Each cell shows what the market is charging for options at that strike and date. Cool colors (blue) mean cheap vol, warm colors (red) mean expensive. You want to buy convexity where the surface is cool — that's where the market is underpricing risk."
              />
            </div>
            {chain && spotPrice > 0 ? (
              <VolSurface chain={chain} spotPrice={spotPrice} />
            ) : (
              <div className="text-bb-gray text-[11px] animate-pulse">
                Loading surface data...
              </div>
            )}
          </Panel>
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
