"use client";

import { useEffect, useState } from "react";

interface HeaderBarProps {
  vixLevel?: number;
  marketOpen?: boolean;
  dataTimestamp?: number;
}

export function HeaderBar({ vixLevel, marketOpen, dataTimestamp }: HeaderBarProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    function updateTime() {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    updateTime();
    const id = setInterval(updateTime, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between border-b border-bb-gray px-3 py-1 bg-bb-darkgray text-[12px]">
      <div className="flex items-center gap-4">
        <span className="text-bb-amber font-bold tracking-widest text-[14px]">
          RAHWAN-BEAR-SWAN BROWSER
        </span>
        <span className="text-bb-white">TERMINAL v1.0</span>
      </div>
      <div className="flex items-center gap-4">
        {vixLevel !== undefined && (
          <span className="text-bb-white">
            VIX{" "}
            <span className={vixLevel > 20 ? "text-bb-red" : "text-bb-green"}>
              {vixLevel.toFixed(2)}
            </span>
          </span>
        )}
        <span
          className={`text-[11px] ${marketOpen ? "text-bb-green" : "text-bb-red"}`}
        >
          {marketOpen ? "● MKT OPEN" : "● MKT CLOSED"}
        </span>
        {!marketOpen && dataTimestamp && (
          <span className="text-bb-gray text-[10px]">
            DATA AS OF{" "}
            {new Date(dataTimestamp).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        )}
        <span className="text-bb-orange font-bold tabular-nums">{time}</span>
      </div>
    </div>
  );
}
