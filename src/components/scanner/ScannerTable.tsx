"use client";

import type { ScanResult } from "@/lib/types";
import { DataGrid, type Column } from "../bloomberg/DataGrid";
import { ScoreBar } from "./ScoreBar";
import { Badge } from "../bloomberg/Badge";

interface ScannerTableProps {
  results: ScanResult[];
  selectedIndex: number;
  onSelectRow: (index: number) => void;
}

const columns: Column<ScanResult>[] = [
  {
    key: "rank",
    header: "#",
    width: "3ch",
    align: "right",
    render: (_row, i) => (
      <span className="text-bb-white font-bold">{i + 1}</span>
    ),
  },
  {
    key: "symbol",
    header: "Symbol",
    width: "7ch",
    render: (row) => (
      <span className="text-bb-amber font-bold">{row.symbol}</span>
    ),
  },
  {
    key: "name",
    header: "Name",
    width: "16ch",
    render: (row) => (
      <span className="text-bb-white truncate block max-w-[16ch]">
        {row.name}
      </span>
    ),
  },
  {
    key: "compositeScore",
    header: "Score",
    width: "12ch",
    align: "center",
    render: (row) => <ScoreBar score={row.compositeScore} />,
  },
  {
    key: "ivPercentile",
    header: "IV%ile",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.ivPercentile.signal} />
    ),
  },
  {
    key: "skewKurtosis",
    header: "Skew",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.skewKurtosis.signal} />
    ),
  },
  {
    key: "dealerGamma",
    header: "GEX",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.dealerGamma.signal} />
    ),
  },
  {
    key: "termStructure",
    header: "Term",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.termStructure.signal} />
    ),
  },
  {
    key: "vanna",
    header: "Vanna",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.vanna.signal} />
    ),
  },
  {
    key: "charm",
    header: "Charm",
    width: "7ch",
    align: "center",
    render: (row) => (
      <Badge signal={row.criteria.charm.signal} />
    ),
  },
  {
    key: "lastPrice",
    header: "Last",
    width: "8ch",
    align: "right",
    render: (row) => (
      <span className="text-bb-white tabular-nums">
        {row.lastPrice.toFixed(2)}
      </span>
    ),
  },
  {
    key: "changePct",
    header: "Chg%",
    width: "7ch",
    align: "right",
    render: (row) => (
      <span
        className={`tabular-nums ${row.changePct >= 0 ? "text-bb-green" : "text-bb-red"}`}
      >
        {row.changePct >= 0 ? "+" : ""}
        {row.changePct.toFixed(2)}%
      </span>
    ),
  },
];

export function ScannerTable({
  results,
  selectedIndex,
  onSelectRow,
}: ScannerTableProps) {
  return (
    <DataGrid
      columns={columns}
      data={results}
      selectedIndex={selectedIndex}
      onSelectRow={onSelectRow}
      getRowKey={(row) => row.symbol}
    />
  );
}
