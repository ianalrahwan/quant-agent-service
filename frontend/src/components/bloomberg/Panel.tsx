"use client";

interface PanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <div className={`border border-bb-gray ${className}`}>
      {title && (
        <div className="px-2 py-1 border-b border-bb-gray text-[11px] text-bb-amber font-bold uppercase tracking-wider bg-bb-darkgray">
          {title}
        </div>
      )}
      <div className="p-2">{children}</div>
    </div>
  );
}
