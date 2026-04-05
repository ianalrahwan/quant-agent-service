"use client";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T, index: number) => React.ReactNode;
}

interface DataGridProps<T> {
  columns: Column<T>[];
  data: T[];
  selectedIndex?: number;
  onSelectRow?: (index: number) => void;
  getRowKey?: (row: T, index: number) => string;
}

export function DataGrid<T>({
  columns,
  data,
  selectedIndex = -1,
  onSelectRow,
  getRowKey,
}: DataGridProps<T>) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse font-mono text-[12px]">
        <thead>
          <tr className="border-b border-bb-gray">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-2 py-1 text-bb-amber font-bold uppercase text-[11px] tracking-wider ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left"
                }`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={getRowKey ? getRowKey(row, i) : i}
              className={`border-b border-bb-midgray cursor-pointer transition-colors ${
                i === selectedIndex
                  ? "bg-bb-blue/30 text-bb-brightwhite"
                  : i % 2 === 0
                    ? "bg-bb-black"
                    : "bg-bb-darkgray"
              } hover:bg-bb-blue/20`}
              onClick={() => onSelectRow?.(i)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-2 py-1 ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  }`}
                >
                  {col.render
                    ? col.render(row, i)
                    : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
