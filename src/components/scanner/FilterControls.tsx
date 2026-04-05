"use client";

interface FilterControlsProps {
  sectorFilter: string;
  onSectorChange: (sector: string) => void;
  minScore: number;
  onMinScoreChange: (score: number) => void;
  termFilter: string;
  onTermFilterChange: (filter: string) => void;
  signalFilter: string;
  onSignalFilterChange: (filter: string) => void;
}

const SECTORS = [
  { value: "all", label: "ALL" },
  { value: "index", label: "INDEX" },
  { value: "equity", label: "EQUITY" },
  { value: "commodity", label: "COMMODITY" },
  { value: "sector", label: "SECTOR" },
];

const TERM_FILTERS = [
  { value: "all", label: "ALL" },
  { value: "backwardation", label: "BACKW." },
  { value: "contango", label: "CONTANGO" },
];

const SIGNAL_FILTERS = [
  { value: "all", label: "ALL" },
  { value: "strong", label: "STRONG" },
  { value: "moderate", label: "MOD+" },
];

export function FilterControls({
  sectorFilter,
  onSectorChange,
  minScore,
  onMinScoreChange,
  termFilter,
  onTermFilterChange,
  signalFilter,
  onSignalFilterChange,
}: FilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] px-2 py-2 border-b border-bb-gray bg-bb-darkgray">
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
                : "bg-bb-black text-bb-white/50 hover:text-bb-white border border-bb-gray"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-bb-white">Term</span>
        {TERM_FILTERS.map((t) => (
          <button
            key={t.value}
            onClick={() => onTermFilterChange(t.value)}
            className={`px-2 py-0 ${
              termFilter === t.value
                ? "bg-bb-blue text-bb-brightwhite"
                : "bg-bb-black text-bb-white/50 hover:text-bb-white border border-bb-gray"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-bb-white">Signal</span>
        {SIGNAL_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => onSignalFilterChange(s.value)}
            className={`px-2 py-0 ${
              signalFilter === s.value
                ? "bg-bb-blue text-bb-brightwhite"
                : "bg-bb-black text-bb-white/50 hover:text-bb-white border border-bb-gray"
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
