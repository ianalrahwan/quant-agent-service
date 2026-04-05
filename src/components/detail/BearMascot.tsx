"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

export function BearMascot({ state, size = 64 }: BearMascotProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${state === "thinking" ? "animate-bounce" : ""}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ears */}
          <circle cx="16" cy="12" r="10" fill="#333" />
          <circle cx="48" cy="12" r="10" fill="#333" />
          <circle cx="16" cy="12" r="6" fill="#555" />
          <circle cx="48" cy="12" r="6" fill="#555" />

          {/* Head */}
          <circle cx="32" cy="32" r="22" fill="#444" />

          {/* Eyes */}
          {state === "idle" ? (
            <>
              <circle cx="24" cy="28" r="3" fill="#4af6c3" />
              <circle cx="40" cy="28" r="3" fill="#4af6c3" />
            </>
          ) : state === "thinking" ? (
            <>
              <line x1="21" y1="28" x2="27" y2="28" stroke="#4af6c3" strokeWidth="2" />
              <line x1="37" y1="28" x2="43" y2="28" stroke="#4af6c3" strokeWidth="2" />
            </>
          ) : state === "checkpoint" ? (
            <>
              <circle cx="24" cy="28" r="4" fill="#ffa500" />
              <circle cx="40" cy="28" r="4" fill="#ffa500" />
              <circle cx="24" cy="28" r="2" fill="#0a0a0a" />
              <circle cx="40" cy="28" r="2" fill="#0a0a0a" />
            </>
          ) : state === "complete" ? (
            <>
              <path d="M21 27 Q24 24 27 27" stroke="#4af6c3" strokeWidth="2" fill="none" />
              <path d="M37 27 Q40 24 43 27" stroke="#4af6c3" strokeWidth="2" fill="none" />
            </>
          ) : (
            <>
              <line x1="21" y1="25" x2="27" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="27" y1="25" x2="21" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="37" y1="25" x2="43" y2="31" stroke="#ff433d" strokeWidth="2" />
              <line x1="43" y1="25" x2="37" y2="31" stroke="#ff433d" strokeWidth="2" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="32" cy="35" rx="4" ry="3" fill="#222" />

          {/* Mouth */}
          {state === "complete" ? (
            <path d="M26 40 Q32 46 38 40" stroke="#4af6c3" strokeWidth="1.5" fill="none" />
          ) : state === "error" ? (
            <path d="M26 44 Q32 38 38 44" stroke="#ff433d" strokeWidth="1.5" fill="none" />
          ) : (
            <line x1="28" y1="42" x2="36" y2="42" stroke="#999" strokeWidth="1.5" />
          )}
        </svg>

        {/* Thinking indicator */}
        {state === "thinking" && (
          <div className="absolute -top-2 -right-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bb-amber opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-bb-amber" />
            </span>
          </div>
        )}
      </div>

      <span className="text-xs text-bb-white font-mono">
        {state === "idle" && "READY"}
        {state === "thinking" && "ANALYZING..."}
        {state === "checkpoint" && "AWAITING INPUT"}
        {state === "complete" && "COMPLETE"}
        {state === "error" && "ERROR"}
      </span>
    </div>
  );
}
