"use client";

import type { BearState } from "@/lib/agent-types";

interface BearMascotProps {
  state: BearState;
  size?: number;
}

/**
 * California Republic grizzly bear — clean profile silhouette.
 * Uses a single path traced to look like the flag bear.
 * Walking when thinking. Standing when checkpoint/complete. Standing when idle/error.
 */
export function BearMascot({ state, size = 48 }: BearMascotProps) {
  const isRunning = state === "thinking";

  // Aspect ratio ~1.6:1 (wide bear profile)
  const w = size * 1.6;
  const h = size;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: w, height: h }}>
        <svg
          viewBox="0 0 160 100"
          width={w}
          height={h}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className="fill-bb-amber">
            {/* ── BODY: single continuous path, grizzly profile ── */}
            <path d={[
              // Start at tail
              "M10,58",
              // Tail up
              "C6,48 8,40 14,38",
              // Rump up to back
              "C20,32 30,28 42,26",
              // Back with shoulder hump
              "C54,22 64,18 74,16",
              // Hump peak
              "C82,14 88,14 94,16",
              // Neck down to head
              "C98,17 102,16 106,14",
              // Top of head
              "C110,12 116,12 120,14",
              // Forehead to snout
              "C126,16 132,18 136,22",
              // Snout tip down
              "C138,24 140,28 138,30",
              // Under jaw
              "C136,32 130,32 126,30",
              // Throat
              "C122,28 118,28 114,30",
              // Chest down
              "C110,34 108,40 108,46",
              // Front leg front
              "L110,72",
              // Front paw
              "C110,76 114,78 118,78",
              "C120,78 120,76 120,72",
              // Up between front legs
              "L120,52",
              "L102,48",
              // Belly
              "C90,52 70,54 56,52",
              // Down to hind leg
              "L50,72",
              // Hind paw
              "C50,76 54,78 58,78",
              "C60,78 60,76 60,72",
              // Up hind leg back
              "L60,56",
              "L40,50",
              // Under rump back to tail
              "C28,52 18,56 14,58",
              "Z",
            ].join(" ")} />

            {/* Ear */}
            <ellipse cx="112" cy="12" rx="5" ry="6" />

            {/* Eye */}
            <circle cx="126" cy="20" r="2.5" className="fill-bb-black" />

            {/* Nose */}
            <circle cx="137" cy="26" r="2.5" className="fill-bb-black" />
          </g>

          {/* Star — California flag, shown on complete */}
          {state === "complete" && (
            <polygon
              points="148,14 150.5,8 153,14 147,10.5 154,10.5"
              className="fill-bb-green"
            />
          )}
        </svg>

        {/* Running legs overlay — animated separately so body stays clean */}
        {isRunning && (
          <div className="absolute inset-0 pointer-events-none">
            <svg viewBox="0 0 160 100" width={w} height={h}>
              {/* Animated front legs */}
              <rect x="108" y="46" width="5" height="26" rx="2.5"
                className="fill-bb-amber"
                style={{ transformOrigin: "110px 46px", animation: "legA 0.35s ease-in-out infinite alternate" }}
              />
              <rect x="116" y="46" width="5" height="26" rx="2.5"
                className="fill-bb-amber"
                style={{ transformOrigin: "118px 46px", animation: "legA 0.35s ease-in-out infinite alternate-reverse" }}
              />
              {/* Animated hind legs */}
              <rect x="48" y="46" width="5" height="26" rx="2.5"
                className="fill-bb-amber"
                style={{ transformOrigin: "50px 46px", animation: "legB 0.35s ease-in-out infinite alternate-reverse" }}
              />
              <rect x="56" y="46" width="5" height="26" rx="2.5"
                className="fill-bb-amber"
                style={{ transformOrigin: "58px 46px", animation: "legB 0.35s ease-in-out infinite alternate" }}
              />
            </svg>
          </div>
        )}

        {/* Thinking pulse */}
        {isRunning && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bb-amber opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-bb-amber" />
          </span>
        )}
      </div>

      <span className="text-xs text-bb-white font-mono">
        {state === "idle" && "READY"}
        {state === "thinking" && "ANALYZING..."}
        {state === "checkpoint" && "AWAITING INPUT"}
        {state === "complete" && "COMPLETE"}
        {state === "error" && "ERROR"}
      </span>

      <style>{`
        @keyframes legA {
          from { transform: rotate(-25deg); }
          to { transform: rotate(25deg); }
        }
        @keyframes legB {
          from { transform: rotate(-20deg); }
          to { transform: rotate(20deg); }
        }
      `}</style>
    </div>
  );
}
