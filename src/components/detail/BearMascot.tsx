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
          {/* Body */}
          <ellipse cx="40" cy="82" rx="18" ry="16" fill="#A0673C" />

          {/* Clipboard - held in front of body */}
          <rect x="27" y="72" width="16" height="20" rx="1.5" fill="#C4956A" stroke="#8B5E3C" strokeWidth="1" />
          <rect x="32" y="70" width="6" height="3" rx="1" fill="#8B5E3C" />
          <line x1="30" y1="78" x2="40" y2="78" stroke="#8B5E3C" strokeWidth="0.8" opacity="0.6" />
          <line x1="30" y1="81" x2="40" y2="81" stroke="#8B5E3C" strokeWidth="0.8" opacity="0.6" />
          <line x1="30" y1="84" x2="37" y2="84" stroke="#8B5E3C" strokeWidth="0.8" opacity="0.6" />

          {/* Left arm (behind clipboard) */}
          <ellipse cx="24" cy="80" rx="5" ry="8" fill="#8B5E3C" transform="rotate(15, 24, 80)" />

          {/* Right arm */}
          <ellipse cx="56" cy="80" rx="5" ry="8" fill="#8B5E3C" transform="rotate(-15, 56, 80)" />

          {/* Ears - visible behind head */}
          <circle cx="22" cy="28" r="8" fill="#8B5E3C" />
          <circle cx="58" cy="28" r="8" fill="#8B5E3C" />
          <circle cx="22" cy="28" r="5" fill="#C4956A" />
          <circle cx="58" cy="28" r="5" fill="#C4956A" />

          {/* Head */}
          <circle cx="40" cy="38" r="20" fill="#A0673C" />

          {/* Muzzle */}
          <ellipse cx="40" cy="44" rx="11" ry="8" fill="#C9A87C" />

          {/* Eyes */}
          {state === "idle" ? (
            <>
              <circle cx="33" cy="35" r="2.5" fill="#1a1a1a" />
              <circle cx="47" cy="35" r="2.5" fill="#1a1a1a" />
              <circle cx="34" cy="34" r="0.8" fill="#fff" />
              <circle cx="48" cy="34" r="0.8" fill="#fff" />
            </>
          ) : state === "thinking" ? (
            <>
              <line x1="30" y1="35" x2="36" y2="35" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="44" y1="35" x2="50" y2="35" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
            </>
          ) : state === "checkpoint" ? (
            <>
              <circle cx="33" cy="35" r="3.5" fill="#ffa500" />
              <circle cx="47" cy="35" r="3.5" fill="#ffa500" />
              <circle cx="33" cy="35" r="1.5" fill="#1a1a1a" />
              <circle cx="47" cy="35" r="1.5" fill="#1a1a1a" />
            </>
          ) : state === "complete" ? (
            <>
              <path d="M30 34 Q33 31 36 34" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M44 34 Q47 31 50 34" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1="30" y1="32" x2="36" y2="38" stroke="#ff433d" strokeWidth="2" />
              <line x1="36" y1="32" x2="30" y2="38" stroke="#ff433d" strokeWidth="2" />
              <line x1="44" y1="32" x2="50" y2="38" stroke="#ff433d" strokeWidth="2" />
              <line x1="50" y1="32" x2="44" y2="38" stroke="#ff433d" strokeWidth="2" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="40" cy="42" rx="3.5" ry="2.5" fill="#1a1a1a" />
          <ellipse cx="39" cy="41.5" rx="1.2" ry="0.8" fill="#444" opacity="0.5" />

          {/* Mouth */}
          {state === "complete" ? (
            <path d="M35 47 Q40 52 45 47" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : state === "error" ? (
            <path d="M35 50 Q40 46 45 50" stroke="#ff433d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : (
            <>
              <path d="M40 44.5 L37.5 47" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M40 44.5 L42.5 47" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* Hat - flat-brimmed ranger/working hat */}
          <ellipse cx="40" cy="22" rx="22" ry="4" fill="#5C4033" />
          <path d="M26 22 Q26 8 40 6 Q54 8 54 22" fill="#6B4E37" />
          <rect x="26" y="20" width="28" height="3" rx="1" fill="#4A3228" />
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
