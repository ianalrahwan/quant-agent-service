"use client";

import { useState, useMemo } from "react";
import { structurePayoff } from "@/lib/black-scholes";
import type { MatchedLeg } from "./TradeRecDetail";

interface PayoffChartProps {
  legs: MatchedLeg[];
  spotPrice: number;
  maxDte: number;
}

const CHART_W = 400;
const CHART_H = 160;
const PAD_L = 45;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 25;

const INNER_W = CHART_W - PAD_L - PAD_R;
const INNER_H = CHART_H - PAD_T - PAD_B;

export function PayoffChart({ legs, spotPrice, maxDte }: PayoffChartProps) {
  const [dte, setDte] = useState(maxDte);

  // Only use legs with a known mid and iv
  const validLegs = legs.filter(
    (leg): leg is MatchedLeg & { mid: number; iv: number } =>
      leg.mid !== null && leg.iv !== null
  );

  const points = useMemo(() => {
    if (validLegs.length === 0) return [];
    return structurePayoff(
      validLegs.map((leg) => ({
        strike: leg.strike,
        iv: leg.iv,
        type: leg.type,
        action: leg.action,
        entryPrice: leg.mid,
      })),
      spotPrice,
      dte
    );
  }, [validLegs, spotPrice, dte]);

  if (validLegs.length === 0) {
    return (
      <div className="text-bb-gray text-[11px] font-mono mt-2">
        Payoff chart unavailable — missing live pricing data.
      </div>
    );
  }

  const spotMin = spotPrice * 0.85;
  const spotMax = spotPrice * 1.15;
  const pnlValues = points.map((p) => p.pnl);
  const pnlMax = Math.max(...pnlValues, 0);
  const pnlMin = Math.min(...pnlValues, 0);
  const pnlRange = pnlMax - pnlMin || 1;

  function toX(spot: number): number {
    return PAD_L + ((spot - spotMin) / (spotMax - spotMin)) * INNER_W;
  }

  function toY(pnl: number): number {
    return PAD_T + INNER_H - ((pnl - pnlMin) / pnlRange) * INNER_H;
  }

  const zeroY = toY(0);
  const spotX = toX(spotPrice);

  // Build polyline points string
  const curvePoints = points.map((p) => `${toX(p.spot)},${toY(p.pnl)}`).join(" ");

  // Build filled profit polygon (above zero line)
  const profitFill = points
    .map((p) => {
      const x = toX(p.spot);
      const y = p.pnl > 0 ? toY(p.pnl) : zeroY;
      return `${x},${y}`;
    })
    .join(" ");

  const firstX = toX(points[0]?.spot ?? spotMin);
  const lastX = toX(points[points.length - 1]?.spot ?? spotMax);
  const profitPolygon = `${firstX},${zeroY} ${profitFill} ${lastX},${zeroY}`;

  const dteLabel =
    dte === 0
      ? "(at expiry)"
      : `(${dte}d to expiry)`;

  return (
    <div className="font-mono mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-bb-amber uppercase text-[10px] tracking-wider">
          Payoff Chart
        </span>
        <span className="text-bb-gray text-[10px]">{dteLabel}</span>
      </div>

      <svg
        width={CHART_W}
        height={CHART_H}
        className="font-mono overflow-visible"
        style={{ maxWidth: "100%" }}
      >
        {/* Profit fill */}
        {points.length > 1 && (
          <polygon
            points={profitPolygon}
            fill="#4af6c3"
            fillOpacity={0.08}
          />
        )}

        {/* Zero line */}
        <line
          x1={PAD_L}
          y1={zeroY}
          x2={CHART_W - PAD_R}
          y2={zeroY}
          stroke="#555555"
          strokeWidth="1"
        />

        {/* Spot reference line (vertical dashed orange) */}
        <line
          x1={spotX}
          y1={PAD_T}
          x2={spotX}
          y2={PAD_T + INNER_H}
          stroke="#fb8b1e"
          strokeDasharray="4,3"
          strokeWidth="1"
        />

        {/* P&L curve */}
        {points.length > 1 && (
          <polyline
            points={curvePoints}
            fill="none"
            stroke="#4af6c3"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {/* Y-axis labels */}
        <text
          x={PAD_L - 4}
          y={PAD_T + 4}
          textAnchor="end"
          fill="#4af6c3"
          fontSize="10"
        >
          {pnlMax >= 0 ? `+${pnlMax.toFixed(0)}` : pnlMax.toFixed(0)}
        </text>
        <text
          x={PAD_L - 4}
          y={zeroY + 4}
          textAnchor="end"
          fill="#888888"
          fontSize="10"
        >
          $0
        </text>
        {pnlMin < 0 && (
          <text
            x={PAD_L - 4}
            y={PAD_T + INNER_H}
            textAnchor="end"
            fill="#ff433d"
            fontSize="10"
          >
            {pnlMin.toFixed(0)}
          </text>
        )}

        {/* X-axis labels */}
        <text
          x={PAD_L}
          y={CHART_H - 4}
          textAnchor="start"
          fill="#888888"
          fontSize="10"
        >
          {spotMin.toFixed(0)}
        </text>
        <text
          x={CHART_W - PAD_R}
          y={CHART_H - 4}
          textAnchor="end"
          fill="#888888"
          fontSize="10"
        >
          {spotMax.toFixed(0)}
        </text>
      </svg>

      {/* Date slider */}
      <div className="mt-2 flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={maxDte}
          step={1}
          value={dte}
          onChange={(e) => setDte(Number(e.target.value))}
          className="w-full accent-bb-amber cursor-pointer"
          style={{ direction: "rtl" }}
        />
        <div className="flex justify-between text-[10px] text-bb-gray">
          <span>EXPIRY</span>
          <span>NOW</span>
        </div>
      </div>
    </div>
  );
}
