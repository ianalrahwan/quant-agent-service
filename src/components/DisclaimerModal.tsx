"use client";
import { useEffect, useState } from "react";

const ACK_KEY = "disclaimer-ack-v1";

type Mode = "first-visit" | "upgrade-prompt";

interface Props {
  forceMode?: Mode | null;
  onClose?: () => void;
}

export function DisclaimerModal({ forceMode = null, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("first-visit");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forceMode) {
      setMode(forceMode);
      setOpen(true);
      return;
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(ACK_KEY) !== "true") {
      setMode("first-visit");
      setOpen(true);
    }
  }, [forceMode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (mode === "first-visit") {
      window.localStorage.setItem(ACK_KEY, "true");
    }
    if (password) {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!resp.ok && mode === "upgrade-prompt") {
        setError("Invalid password.");
        setSubmitting(false);
        return;
      }
    }
    setOpen(false);
    onClose?.();
    setSubmitting(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="border border-bb-amber bg-bb-black text-bb-brightwhite max-w-lg w-full p-6 font-mono">
        <h2 className="text-bb-amber text-lg font-bold mb-3">
          {mode === "first-visit" ? "ACKNOWLEDGE" : "PRO ACCESS"}
        </h2>
        {mode === "first-visit" && (
          <p className="text-sm leading-relaxed mb-4">
            This is a portfolio project by{" "}
            <a
              href="https://github.com/ianalrahwan/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bb-amber underline"
            >
              Ian Rahwan
            </a>
            . Nothing displayed here is financial advice. Vol regimes, signals, and
            generated narratives are for demonstration purposes only.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-bb-gray block mb-1">
              {mode === "first-visit" ? "Pro access (optional)" : "Enter password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bb-darkgray border border-bb-gray text-bb-brightwhite text-sm px-2 py-1 outline-none focus:border-bb-amber"
              placeholder="••••••"
              autoFocus={mode === "upgrade-prompt"}
            />
          </div>
          {error && <p className="text-xs text-bb-red">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full border border-bb-amber text-bb-amber py-2 hover:bg-bb-amber/10 disabled:opacity-50"
          >
            {mode === "first-visit" ? "ACKNOWLEDGE" : "UNLOCK PRO"}
          </button>
        </form>
      </div>
    </div>
  );
}
