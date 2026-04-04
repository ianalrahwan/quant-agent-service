"use client";

import type { SignalStrength } from "@/lib/types";

interface BadgeProps {
  signal: SignalStrength;
  label?: string;
}

const SIGNAL_STYLES: Record<SignalStrength, string> = {
  strong: "text-bb-green bg-bb-green/10",
  moderate: "text-bb-amber bg-bb-amber/10",
  weak: "text-bb-white bg-bb-white/10",
  neutral: "text-bb-gray bg-bb-gray/10",
};

const SIGNAL_LABELS: Record<SignalStrength, string> = {
  strong: "STRONG",
  moderate: "MOD",
  weak: "WEAK",
  neutral: "—",
};

export function Badge({ signal, label }: BadgeProps) {
  return (
    <span
      className={`inline-block px-1 text-[10px] font-bold uppercase tracking-wider ${SIGNAL_STYLES[signal]}`}
    >
      {label ?? SIGNAL_LABELS[signal]}
    </span>
  );
}
