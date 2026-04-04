"use client";

interface FnKey {
  key: string;
  label: string;
  action?: () => void;
}

interface FunctionBarProps {
  keys?: FnKey[];
}

const DEFAULT_KEYS: FnKey[] = [
  { key: "F1", label: "HELP" },
  { key: "F2", label: "SCAN" },
  { key: "F3", label: "FILTER" },
  { key: "F5", label: "WATCH" },
  { key: "F8", label: "SORT" },
  { key: "ESC", label: "BACK" },
];

export function FunctionBar({ keys = DEFAULT_KEYS }: FunctionBarProps) {
  return (
    <div className="flex items-center border-t border-bb-gray bg-bb-darkgray px-2 py-1 text-[11px]">
      {keys.map((fk) => (
        <button
          key={fk.key}
          onClick={fk.action}
          className="flex items-center mr-4 hover:text-bb-amber transition-colors"
        >
          <span className="bg-bb-gray text-bb-brightwhite px-1 mr-1 font-bold">
            {fk.key}
          </span>
          <span className="text-bb-white">{fk.label}</span>
        </button>
      ))}
    </div>
  );
}
