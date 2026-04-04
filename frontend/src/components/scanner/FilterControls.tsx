"use client";

interface FilterControlsProps {
  sectorFilter: string;
  onSectorChange: (sector: string) => void;
  minScore: number;
  onMinScoreChange: (score: number) => void;
}

const SECTORS = [
  { value: "all", label: "ALL" },
  { value: "index", label: "INDEX" },
  { value: "equity", label: "EQUITY" },
  { value: "commodity", label: "COMMODITY" },
  { value: "sector", label: "SECTOR" },
];

export function FilterControls({
  sectorFilter,
  onSectorChange,
  minScore,
  onMinScoreChange,
}: FilterControlsProps) {
  return (
    <div className="flex items-center gap-4 text-[11px] px-2 py-1 border-b border-bb-gray">
      <span className="text-bb-amber font-bold">FILTER:</span>
      <div className="flex items-center gap-1">
        <span className="text-bb-white">Sector</span>
        {SECTORS.map((s) => (
          <button
            key={s.value}
            onClick={() => onSectorChange(s.value)}
            className={`px-2 py-0 ${
              sectorFilter === s.value
                ? "bg-bb-blue text-bb-brightwhite"
                : "bg-bb-darkgray text-bb-gray hover:text-bb-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-bb-white">Min Score</span>
        <input
          type="range"
          min="0"
          max="100"
          value={minScore}
          onChange={(e) => onMinScoreChange(Number(e.target.value))}
          className="w-20 accent-bb-orange"
        />
        <span className="text-bb-orange tabular-nums w-[3ch]">{minScore}</span>
      </div>
    </div>
  );
}
