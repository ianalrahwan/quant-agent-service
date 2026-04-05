"use client";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
}

interface TickerTapeProps {
  items: TickerItem[];
}

export function TickerTape({ items }: TickerTapeProps) {
  if (items.length === 0) return null;

  // Duplicate items for seamless scroll loop
  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-bb-gray bg-bb-black py-[2px] text-[11px]">
      <div className="ticker-scroll whitespace-nowrap inline-flex">
        {doubled.map((item, i) => (
          <span key={i} className="mx-3">
            <span className="text-bb-amber font-bold">{item.symbol}</span>{" "}
            <span className="text-bb-white">
              {item.price.toFixed(2)}
            </span>{" "}
            <span
              className={item.change >= 0 ? "text-bb-green" : "text-bb-red"}
            >
              {item.change >= 0 ? "▲" : "▼"}
              {Math.abs(item.change).toFixed(2)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
