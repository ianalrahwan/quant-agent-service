"use client";

interface ScoreBarProps {
  score: number; // 0-1
  width?: number;
}

export function ScoreBar({ score, width = 60 }: ScoreBarProps) {
  const filled = Math.round(score * 10);
  const filledColor =
    score >= 0.75
      ? "text-bb-green"
      : score >= 0.5
        ? "text-bb-amber"
        : score >= 0.25
          ? "text-bb-white"
          : "text-bb-white/40";

  return (
    <span className="inline-flex items-center gap-1" style={{ width }}>
      <span className="text-[10px] font-mono">
        <span className={filledColor}>{"█".repeat(filled)}</span>
        <span className="text-bb-white/20">{"░".repeat(10 - filled)}</span>
      </span>
      <span className={`text-[11px] font-bold tabular-nums ${filledColor}`}>
        {(score * 100).toFixed(0)}
      </span>
    </span>
  );
}
