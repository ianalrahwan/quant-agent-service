"use client";

import { useState } from "react";

interface InfoTooltipProps {
  quote: string;
  attribution?: string;
}

export function InfoTooltip({
  quote,
  attribution = "— Cem Karsan",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-bb-blue hover:text-bb-amber text-[11px] font-bold ml-1 cursor-pointer"
        title="Info"
      >
        [i]
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-5 z-50 w-[280px] bg-bb-darkgray border border-bb-gray p-3 text-[11px] leading-relaxed shadow-lg">
            <div className="text-bb-white italic">&ldquo;{quote}&rdquo;</div>
            <div className="text-bb-amber mt-2 text-[10px]">{attribution}</div>
            <button
              onClick={() => setOpen(false)}
              className="absolute top-1 right-2 text-bb-gray hover:text-bb-white text-[10px]"
            >
              [x]
            </button>
          </div>
        </>
      )}
    </span>
  );
}
