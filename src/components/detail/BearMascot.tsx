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
          viewBox="0 0 80 100"
          width={size}
          height={size * 1.25}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* --- BODY / OUTFIT --- */}
          {/* Suit jacket */}
          <path d="M22 62 L22 96 Q22 100 26 100 L54 100 Q58 100 58 96 L58 62 Q50 56 40 56 Q30 56 22 62Z" fill="#1e293b" />
          {/* Jacket lapels */}
          <path d="M34 56 L30 72 L40 68Z" fill="#334155" />
          <path d="M46 56 L50 72 L40 68Z" fill="#334155" />
          {/* White dress shirt */}
          <path d="M36 56 L34 100 L46 100 L44 56Z" fill="#e2e8f0" />
          {/* Tie */}
          <path d="M40 58 L37 66 L40 88 L43 66Z" fill="#dc2626" />
          <path d="M38.5 62 L41.5 62 L40 64Z" fill="#b91c1c" />

          {/* Arms in suit sleeves */}
          <rect x="14" y="62" width="10" height="28" rx="5" fill="#1e293b" />
          <rect x="56" y="62" width="10" height="28" rx="5" fill="#1e293b" />
          {/* Paws */}
          <circle cx="19" cy="92" r="5" fill="#A0673C" />
          <circle cx="61" cy="92" r="5" fill="#A0673C" />

          {/* Neck - connects head to body */}
          <rect x="33" y="50" width="14" height="10" rx="2" fill="#A0673C" />

          {/* --- HEAD --- */}
          {/* Ears - visible behind head */}
          <circle cx="20" cy="24" r="8" fill="#8B5E3C" />
          <circle cx="60" cy="24" r="8" fill="#8B5E3C" />
          <circle cx="20" cy="24" r="5" fill="#C4956A" />
          <circle cx="60" cy="24" r="5" fill="#C4956A" />

          {/* Head */}
          <circle cx="40" cy="32" r="20" fill="#A0673C" />

          {/* Muzzle */}
          <ellipse cx="40" cy="38" rx="11" ry="8" fill="#C9A87C" />

          {/* Eyes */}
          {state === "idle" ? (
            <>
              <circle cx="33" cy="29" r="2.5" fill="#1a1a1a" />
              <circle cx="47" cy="29" r="2.5" fill="#1a1a1a" />
              <circle cx="34" cy="28" r="0.8" fill="#fff" />
              <circle cx="48" cy="28" r="0.8" fill="#fff" />
            </>
          ) : state === "thinking" ? (
            <>
              <line x1="30" y1="29" x2="36" y2="29" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="44" y1="29" x2="50" y2="29" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
            </>
          ) : state === "checkpoint" ? (
            <>
              <circle cx="33" cy="29" r="3.5" fill="#ffa500" />
              <circle cx="47" cy="29" r="3.5" fill="#ffa500" />
              <circle cx="33" cy="29" r="1.5" fill="#1a1a1a" />
              <circle cx="47" cy="29" r="1.5" fill="#1a1a1a" />
            </>
          ) : state === "complete" ? (
            <>
              <path d="M30 28 Q33 25 36 28" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M44 28 Q47 25 50 28" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1="30" y1="26" x2="36" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="36" y1="26" x2="30" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="44" y1="26" x2="50" y2="32" stroke="#ff433d" strokeWidth="2" />
              <line x1="50" y1="26" x2="44" y2="32" stroke="#ff433d" strokeWidth="2" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="40" cy="36" rx="3.5" ry="2.5" fill="#1a1a1a" />
          <ellipse cx="39" cy="35.5" rx="1.2" ry="0.8" fill="#444" opacity="0.5" />

          {/* Mouth */}
          {state === "complete" ? (
            <path d="M35 41 Q40 46 45 41" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : state === "error" ? (
            <path d="M35 44 Q40 40 45 44" stroke="#ff433d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : (
            <>
              <path d="M40 38.5 L37.5 41" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M40 38.5 L42.5 41" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
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
