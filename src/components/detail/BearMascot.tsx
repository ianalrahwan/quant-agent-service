"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

/**
 * California Republic-style bear. Runs when thinking, sits when error/idle.
 * Minimal, blocky silhouette — like a woodcut or flag print.
 */
export function BearMascot({ state, size = 64 }: BearMascotProps) {
  const isRunning = state === "thinking";
  const isSitting = state === "error" || state === "idle";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${isRunning ? "animate-[walk_0.6s_steps(2)_infinite]" : ""}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 70"
          width={size}
          height={size * 0.7}
          xmlns="http://www.w3.org/2000/svg"
          className="fill-current text-bb-amber"
        >
          {isSitting ? (
            /* ── SITTING POSE ── */
            <g>
              {/* Ears */}
              <circle cx="38" cy="14" r="5" />
              <circle cx="52" cy="14" r="5" />
              {/* Head */}
              <ellipse cx="45" cy="22" rx="12" ry="10" />
              {/* Eye */}
              <circle cx="49" cy="20" r="1.5" className="fill-bb-black" />
              {/* Snout */}
              <ellipse cx="53" cy="24" rx="5" ry="3.5" className="fill-bb-orange" />
              <circle cx="55" cy="23" r="1.2" className="fill-bb-black" />
              {/* Body — hunched, sitting */}
              <ellipse cx="45" cy="42" rx="18" ry="14" />
              {/* Hump */}
              <ellipse cx="38" cy="30" rx="10" ry="7" />
              {/* Front legs (tucked) */}
              <rect x="32" y="50" width="7" height="12" rx="3" />
              <rect x="42" y="50" width="7" height="12" rx="3" />
              {/* Hind leg (folded under) */}
              <ellipse cx="58" cy="52" rx="10" ry="6" />
              {/* Paws */}
              <ellipse cx="35" cy="62" rx="5" ry="3" />
              <ellipse cx="45" cy="62" rx="5" ry="3" />
              {/* Tail */}
              <circle cx="66" cy="44" r="4" />
            </g>
          ) : (
            /* ── WALKING/RUNNING POSE ── */
            <g>
              {/* Ears */}
              <circle cx="68" cy="10" r="5" />
              <circle cx="80" cy="10" r="5" />
              {/* Head */}
              <ellipse cx="75" cy="18" rx="12" ry="10" />
              {/* Eye */}
              <circle cx="80" cy="16" r="1.5" className="fill-bb-black" />
              {/* Snout */}
              <ellipse cx="85" cy="20" rx="5" ry="3.5" className="fill-bb-orange" />
              <circle cx="88" cy="19" r="1.2" className="fill-bb-black" />
              {/* Body */}
              <ellipse cx="52" cy="30" rx="26" ry="13" />
              {/* Shoulder hump */}
              <ellipse cx="65" cy="22" rx="10" ry="8" />
              {/* Front legs (stride) */}
              <rect
                x="62" y="38" width="6" height="20" rx="3"
                className={isRunning ? "origin-top animate-[legSwing_0.6s_ease-in-out_infinite]" : ""}
              />
              <rect
                x="70" y="38" width="6" height="20" rx="3"
                className={isRunning ? "origin-top animate-[legSwingAlt_0.6s_ease-in-out_infinite]" : ""}
              />
              {/* Hind legs (stride) */}
              <rect
                x="32" y="36" width="6" height="22" rx="3"
                className={isRunning ? "origin-top animate-[legSwingAlt_0.6s_ease-in-out_infinite]" : ""}
              />
              <rect
                x="40" y="36" width="6" height="22" rx="3"
                className={isRunning ? "origin-top animate-[legSwing_0.6s_ease-in-out_infinite]" : ""}
              />
              {/* Paws */}
              <ellipse cx="65" cy="58" rx="5" ry="3" />
              <ellipse cx="73" cy="58" rx="5" ry="3" />
              <ellipse cx="35" cy="58" rx="5" ry="3" />
              <ellipse cx="43" cy="58" rx="5" ry="3" />
              {/* Tail */}
              <circle cx="26" cy="28" r="4" />
            </g>
          )}

          {/* Star (California flag homage) — shown on complete */}
          {state === "complete" && (
            <polygon
              points="10,18 12.5,12 15,18 9,14.5 16,14.5"
              className="fill-bb-green"
            />
          )}
        </svg>
      </div>

      <span className="text-xs text-bb-white font-mono">
        {state === "idle" && "READY"}
        {state === "thinking" && "ANALYZING..."}
        {state === "checkpoint" && "AWAITING INPUT"}
        {state === "complete" && "COMPLETE"}
        {state === "error" && "ERROR"}
      </span>

      {/* Keyframe styles for leg animation */}
      <style>{`
        @keyframes legSwing {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes legSwingAlt {
          0%, 100% { transform: rotate(15deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes walk {
          0% { transform: translateX(0); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
