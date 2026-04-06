"use client";

import type { SourceSummary } from "@/lib/agent-types";

interface SourceBadgesProps {
  sources: SourceSummary["sources"] | null;
}

export function SourceBadges({ sources }: SourceBadgesProps) {
  if (!sources) return null;

  const badges: Array<{ label: string; active: boolean; color: string }> = [];

  if (sources.earnings.count > 0) {
    badges.push({ label: "CAT", active: true, color: "text-bb-amber border-bb-amber" });
  }
  if (sources.news.count > 0) {
    badges.push({ label: "NEWS", active: true, color: "text-bb-blue border-bb-blue" });
  }
  if (sources.cftc.count > 0) {
    badges.push({ label: "POS", active: true, color: "text-bb-green border-bb-green" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`text-[10px] px-1 border font-mono ${b.color}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
