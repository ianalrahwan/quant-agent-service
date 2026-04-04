"use client";

import { useState, useRef, useEffect } from "react";

interface CommandLineProps {
  onSubmit: (command: string) => void;
  placeholder?: string;
}

export function CommandLine({
  onSubmit,
  placeholder = "Type ticker symbol...",
}: CommandLineProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim().toUpperCase();
    if (trimmed) {
      onSubmit(trimmed);
      setValue("");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center border-t border-bb-gray bg-bb-black px-3 py-1"
    >
      <span className="text-bb-orange font-bold mr-2">&gt;</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-bb-brightwhite text-[13px] font-mono outline-none placeholder:text-bb-gray"
      />
      <span className="cursor-blink text-bb-orange">█</span>
    </form>
  );
}
