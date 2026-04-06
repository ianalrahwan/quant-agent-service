"use client";

import { useEffect, useRef } from "react";

interface AgentLogProps {
  logs: string[];
}

export function AgentLog({ logs }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="bg-bb-darkgray border border-bb-gray max-h-[150px] overflow-y-auto font-mono text-xs">
      {logs.map((msg, i) => {
        const now = new Date();
        const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
        return (
          <div
            key={i}
            className="px-2 py-0.5 text-bb-white/80 border-b border-bb-gray/30 last:border-0"
          >
            <span className="text-bb-gray mr-2">[{ts}]</span>
            {msg}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
