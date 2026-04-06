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
          {/* Ears - rounded bear ears */}
          <ellipse cx="14" cy="14" r="9" fill="#8B5E3C" />
          <ellipse cx="50" cy="14" r="9" fill="#8B5E3C" />
          <ellipse cx="14" cy="14" r="5" fill="#C4956A" />
          <ellipse cx="50" cy="14" r="5" fill="#C4956A" />

          {/* Head */}
          <circle cx="32" cy="34" r="22" fill="#A0673C" />

          {/* Muzzle */}
          <ellipse cx="32" cy="40" rx="12" ry="9" fill="#C9A87C" />

          {/* Eyes */}
          {state === "idle" ? (
            <>
              <circle cx="24" cy="29" r="3" fill="#1a1a1a" />
              <circle cx="40" cy="29" r="3" fill="#1a1a1a" />
              <circle cx="25" cy="28" r="1" fill="#fff" />
              <circle cx="41" cy="28" r="1" fill="#fff" />
            </>
          ) : state === "thinking" ? (
            <>
              <line x1="21" y1="29" x2="27" y2="29" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="37" y1="29" x2="43" y2="29" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
            </>
          ) : state === "checkpoint" ? (
            <>
              <circle cx="24" cy="29" r="4" fill="#ffa500" />
              <circle cx="40" cy="29" r="4" fill="#ffa500" />
              <circle cx="24" cy="29" r="2" fill="#1a1a1a" />
              <circle cx="40" cy="29" r="2" fill="#1a1a1a" />
            </>
          ) : state === "complete" ? (
            <>
              <path d="M21 28 Q24 25 27 28" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M37 28 Q40 25 43 28" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1="21" y1="26" x2="27" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="27" y1="26" x2="21" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="37" y1="26" x2="43" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="43" y1="26" x2="37" y2="32" stroke="#ff433d" strokeWidth="2" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="32" cy="37" rx="4" ry="3" fill="#1a1a1a" />
          <ellipse cx="31" cy="36.5" rx="1.5" ry="1" fill="#444" opacity="0.5" />

          {/* Mouth */}
          {state === "complete" ? (
            <path d="M27 42 Q32 47 37 42" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : state === "error" ? (
            <path d="M27 46 Q32 41 37 46" stroke="#ff433d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : (
            <>
              <path d="M32 40 L29 43" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M32 40 L35 43" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
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
