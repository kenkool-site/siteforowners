"use client";

import { useState } from "react";

export function PinEntry({ businessName }: { businessName: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(next: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: next }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      if (res.status === 429) setError("Too many attempts. Try again in 15 minutes.");
      else setError("Incorrect PIN");
      setPin("");
    } catch {
      setError("Network error");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  function addDigit(d: string) {
    if (submitting || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) submit(next);
  }

  function backspace() {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-6">
          <div className="text-[color:var(--admin-primary)] font-semibold text-lg">{businessName}</div>
          <div className="text-gray-500 text-sm mt-1">Enter your 6-digit PIN</div>
        </div>

        <div className="flex justify-center gap-2 mb-4" aria-label="PIN dots">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={
                "w-3 h-3 rounded-full " +
                (i < pin.length ? "bg-[var(--admin-primary)]" : "border-2 border-gray-300")
              }
            />
          ))}
        </div>

        {error && (
          <div className="text-center text-red-600 text-sm mb-3" role="alert">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {digits.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addDigit(d)}
              className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium active:bg-gray-100"
              disabled={submitting}
            >
              {d}
            </button>
          ))}
          <span />
          <button
            type="button"
            onClick={() => addDigit("0")}
            className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium active:bg-gray-100"
            disabled={submitting}
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            className="bg-white border border-gray-200 rounded-lg py-4 text-xl font-medium text-gray-500 active:bg-gray-100"
            disabled={submitting || pin.length === 0}
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

        <div className="text-center mt-6">
          <a href="/admin/forgot-pin" className="text-sm text-[color:var(--admin-primary)] hover:underline">
            Forgot PIN?
          </a>
        </div>
      </div>
    </div>
  );
}
