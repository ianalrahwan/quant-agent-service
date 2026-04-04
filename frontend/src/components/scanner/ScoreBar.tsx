"use client";

interface ScoreBarProps {
  score: number; // 0-1
  width?: number;
}

export function ScoreBar({ score, width = 60 }: ScoreBarProps) {
  const filled = Math.round(score * 10);
  const color =
    score >= 0.75
      ? "text-bb-green"
      : score >= 0.5
        ? "text-bb-amber"
        : score >= 0.25
          ? "text-bb-white"
          : "text-bb-gray";

  return (
    <span className={`inline-flex items-center gap-1 ${color}`} style={{ width }}>
      <span className="text-[10px] font-mono">
        {"█".repeat(filled)}
        {"░".repeat(10 - filled)}
      </span>
      <span className="text-[11px] font-bold tabular-nums">
        {(score * 100).toFixed(0)}
      </span>
    </span>
  );
}
