"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

export function BearMascot({ state, size = 40 }: BearMascotProps) {
  const isRunning = state === "thinking";

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`select-none ${isRunning ? "animate-bounce" : ""} ${state === "error" ? "grayscale opacity-50" : ""}`}
        style={{ fontSize: size }}
        role="img"
        aria-label="bear"
      >
        🐻
      </span>
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
