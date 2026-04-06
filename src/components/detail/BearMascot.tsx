"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

/**
 * California Republic-style bear silhouette.
 * Walking pose when thinking/checkpoint/complete. Sitting when idle/error.
 * Single clean path per pose — no overlapping shapes.
 */
export function BearMascot({ state, size = 64 }: BearMascotProps) {
  const isRunning = state === "thinking";
  const isSitting = state === "error" || state === "idle";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: size, height: size * 0.65 }}
      >
        <svg
          viewBox="0 0 120 70"
          width={size}
          height={size * 0.65}
          xmlns="http://www.w3.org/2000/svg"
        >
          {isSitting ? (
            /* ── SITTING: compact silhouette, head up ── */
            <g className="fill-bb-amber">
              {/* Single body+head path */}
              <path d={[
                "M40,62",           // bottom left
                "L40,44",           // up to belly
                "Q36,36 34,30",     // curve up to shoulder
                "Q30,20 36,14",     // up to head top
                "Q42,6 50,12",      // over head
                "Q56,6 62,14",      // right side of head
                "Q68,20 64,30",     // down from head
                "Q62,36 60,44",     // shoulder to belly
                "L60,62",           // down right side
                "Z",
              ].join(" ")} />
              {/* Ears */}
              <circle cx="38" cy="10" r="5" />
              <circle cx="60" cy="10" r="5" />
              {/* Front paws */}
              <rect x="40" y="56" width="8" height="10" rx="4" />
              <rect x="52" y="56" width="8" height="10" rx="4" />
              {/* Hind haunch */}
              <ellipse cx="56" cy="54" rx="12" ry="8" />
              {/* Eye */}
              <circle cx="54" cy="18" r="1.8" className="fill-bb-black" />
              {/* Nose */}
              <circle cx="62" cy="22" r="2" className="fill-bb-black" />
              {/* Snout highlight */}
              <ellipse cx="60" cy="23" rx="5" ry="3" className="fill-bb-orange" />
            </g>
          ) : (
            /* ── WALKING: stretched out, legs extended ── */
            <g className="fill-bb-amber">
              {/* Body — single horizontal shape */}
              <path d={[
                "M20,40",           // tail end
                "Q18,34 24,30",     // rump up
                "Q30,24 50,24",     // back line
                "Q64,22 72,18",     // shoulder hump
                "Q78,14 82,18",     // neck to head
                "Q92,10 96,16",     // top of head
                "Q100,12 102,18",   // forehead
                "Q106,22 100,26",   // face front
                "Q96,30 88,28",     // chin back
                "Q82,28 78,32",     // under jaw to chest
                "Q70,38 60,38",     // belly
                "Q40,40 24,38",     // under belly
                "Q20,38 20,40",     // back to start
                "Z",
              ].join(" ")} />
              {/* Ears */}
              <circle cx="90" cy="12" r="4" />
              <circle cx="100" cy="12" r="4" />
              {/* Shoulder hump emphasis */}
              <ellipse cx="70" cy="22" rx="8" ry="5" />
              {/* Front legs */}
              <rect
                x="72" y="34" width="6" height="24" rx="3"
                style={isRunning ? { transformOrigin: "75px 34px", animation: "legF 0.4s ease-in-out infinite alternate" } : undefined}
              />
              <rect
                x="80" y="34" width="6" height="24" rx="3"
                style={isRunning ? { transformOrigin: "83px 34px", animation: "legF 0.4s ease-in-out infinite alternate-reverse" } : undefined}
              />
              {/* Hind legs */}
              <rect
                x="28" y="34" width="6" height="24" rx="3"
                style={isRunning ? { transformOrigin: "31px 34px", animation: "legH 0.4s ease-in-out infinite alternate-reverse" } : undefined}
              />
              <rect
                x="36" y="34" width="6" height="24" rx="3"
                style={isRunning ? { transformOrigin: "39px 34px", animation: "legH 0.4s ease-in-out infinite alternate" } : undefined}
              />
              {/* Tail */}
              <path d="M20,36 Q12,28 16,24" strokeWidth="4" className="stroke-bb-amber" fill="none" strokeLinecap="round" />
              {/* Eye */}
              <circle cx="98" cy="18" r="1.5" className="fill-bb-black" />
              {/* Nose */}
              <circle cx="104" cy="22" r="1.8" className="fill-bb-black" />
            </g>
          )}

          {/* Star — California flag homage, shown on complete */}
          {state === "complete" && (
            <polygon
              points="8,20 10.5,14 13,20 7,16.5 14,16.5"
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

      <style>{`
        @keyframes legF {
          from { transform: rotate(-20deg); }
          to { transform: rotate(20deg); }
        }
        @keyframes legH {
          from { transform: rotate(-15deg); }
          to { transform: rotate(15deg); }
        }
      `}</style>
    </div>
  );
}
