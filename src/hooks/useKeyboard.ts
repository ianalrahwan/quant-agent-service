"use client";

import { useEffect, useCallback } from "react";

interface KeyboardActions {
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onF2?: () => void;
  onF3?: () => void;
}

export function useKeyboard(actions: KeyboardActions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
          actions.onEscape?.();
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          actions.onArrowUp?.();
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.onArrowDown?.();
          break;
        case "Enter":
          actions.onEnter?.();
          break;
        case "Escape":
          actions.onEscape?.();
          break;
        case "F2":
          e.preventDefault();
          actions.onF2?.();
          break;
        case "F3":
          e.preventDefault();
          actions.onF3?.();
          break;
      }
    },
    [actions]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
