"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

// Polygon data for the low-poly bear. Each entry: [points, fill].
const BEAR_POLYGONS: [string, string][] = [
  // Ears
  ["70,5 65,14 76,12", "#ea580c"],
  ["84,3 79,12 90,10", "#ea580c"],
  // Skull
  ["65,14 76,12 72,22", "#f59e0b"],
  ["76,12 90,10 84,20", "#d97706"],
  ["76,12 84,20 72,22", "#f59e0b"],
  // Snout
  ["84,20 90,10 98,16", "#b45309"],
  ["84,20 98,16 102,22", "#d97706"],
  ["84,20 102,22 96,27", "#b45309"],
  // Jaw
  ["72,22 84,20 80,30", "#d97706"],
  ["72,22 80,30 64,30", "#ea580c"],
  ["80,30 84,20 96,27", "#b45309"],
  // Neck
  ["64,30 80,30 70,38", "#d97706"],
  ["80,30 82,38 70,38", "#b45309"],
  ["56,26 64,30 70,38", "#ea580c"],
  // Upper body
  ["28,28 48,22 56,26", "#f59e0b"],
  ["28,28 56,26 70,38", "#ea580c"],
  ["28,28 70,38 50,46", "#d97706"],
  ["70,38 82,38 74,46", "#b45309"],
  ["70,38 74,46 50,46", "#f59e0b"],
  // Back hump
  ["28,28 18,34 38,38", "#ea580c"],
  ["28,28 38,38 50,46", "#d97706"],
  // Belly
  ["18,34 14,52 38,38", "#b45309"],
  ["38,38 14,52 32,56", "#d97706"],
  ["38,38 32,56 50,46", "#f59e0b"],
  ["50,46 32,56 48,60", "#ea580c"],
  ["50,46 48,60 74,46", "#d97706"],
  ["74,46 48,60 68,58", "#b45309"],
  ["74,46 68,58 82,54", "#f59e0b"],
  // Front legs
  ["68,58 82,54 78,74", "#d97706"],
  ["68,58 78,74 64,74", "#b45309"],
  // Back legs
  ["14,52 32,56 20,74", "#d97706"],
  ["32,56 20,74 30,74", "#ea580c"],
  // Tail
  ["8,38 14,52 18,34", "#ea580c"],
  ["6,35 8,38 18,34", "#d97706"],
];

// CSS animation class assignments for the shatter effect.
// Each polygon gets one of 8 shatter keyframes with different timing.
const SHATTER_CLASSES = [
  "p5", "p2", "p1", "p4", "p3", // ears + skull
  "p2", "p7", "p1",             // snout
  "p6", "p8", "p4",             // jaw
  "p3", "p6", "p5",             // neck
  "p1", "p7", "p3", "p8", "p2", // upper body
  "p4", "p6",                   // back hump
  "p5", "p1", "p7", "p3", "p8", "p2", "p4", // belly
  "p6", "p5",                   // front legs
  "p7", "p8",                   // back legs
  "p3", "p1",                   // tail
];

export function BearMascot({ state, size = 48 }: BearMascotProps) {
  const isThinking = state === "thinking";
  const isError = state === "error";
  const isComplete = state === "complete";

  // Scale factor relative to the default 48px
  const scale = size / 48;
  const w = Math.round(90 * scale);
  const h = Math.round(80 * scale);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={w}
        height={h}
        viewBox="0 0 110 80"
        className={`select-none ${isError ? "opacity-40 grayscale" : ""} ${isComplete ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" : ""}`}
        role="img"
        aria-label="bear mascot"
      >
        <style>{`
          @keyframes shatter1 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(-8px,-12px) rotate(-15deg); opacity: 0.7; } }
          @keyframes shatter2 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(10px,-8px) rotate(12deg); opacity: 0.6; } }
          @keyframes shatter3 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(-6px,10px) rotate(-10deg); opacity: 0.65; } }
          @keyframes shatter4 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(12px,6px) rotate(18deg); opacity: 0.55; } }
          @keyframes shatter5 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(-4px,-14px) rotate(-8deg); opacity: 0.75; } }
          @keyframes shatter6 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(7px,-10px) rotate(14deg); opacity: 0.5; } }
          @keyframes shatter7 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(-10px,5px) rotate(-12deg); opacity: 0.6; } }
          @keyframes shatter8 { 0%,100% { transform: translate(0,0) rotate(0deg); opacity: 1; } 50% { transform: translate(5px,12px) rotate(10deg); opacity: 0.7; } }
          .p1 { animation: shatter1 2.5s ease-in-out infinite; }
          .p2 { animation: shatter2 2.8s ease-in-out infinite 0.2s; }
          .p3 { animation: shatter3 2.3s ease-in-out infinite 0.4s; }
          .p4 { animation: shatter4 2.6s ease-in-out infinite 0.1s; }
          .p5 { animation: shatter5 2.4s ease-in-out infinite 0.3s; }
          .p6 { animation: shatter6 2.7s ease-in-out infinite 0.15s; }
          .p7 { animation: shatter7 2.2s ease-in-out infinite 0.35s; }
          .p8 { animation: shatter8 2.9s ease-in-out infinite 0.25s; }
        `}</style>

        {BEAR_POLYGONS.map(([points, fill], i) => (
          <g key={i} className={isThinking ? SHATTER_CLASSES[i] : undefined}>
            <polygon
              points={points}
              fill={fill}
              stroke="#0a0a0a"
              strokeWidth="0.5"
            />
          </g>
        ))}

        {/* Eye */}
        <circle cx="82" cy="18" r="1.3" fill="#0a0a0a" />
        {/* Nose */}
        <circle cx="101" cy="20" r="1.5" fill="#0a0a0a" />
      </svg>

      <span className="text-[10px] text-bb-white font-mono tracking-wide">
        {state === "idle" && "READY"}
        {state === "thinking" && "ANALYZING..."}
        {state === "checkpoint" && "AWAITING INPUT"}
        {state === "complete" && "COMPLETE ✦"}
        {state === "error" && "ERROR"}
      </span>
    </div>
  );
}
