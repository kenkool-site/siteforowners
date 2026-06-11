"use client";

import { useState } from "react";

type PinErrorField = "current" | "new" | "confirm" | "form";

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    field: PinErrorField;
    message: string;
  } | null>(null);
  const [done, setDone] = useState(false);

  function updatePin(
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ) {
    setter(value.replace(/\D/g, "").slice(0, 6));
    setError(null);
    setDone(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!/^\d{6}$/.test(currentPin)) {
      setError({ field: "current", message: "PIN must be exactly 6 digits" });
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setError({ field: "new", message: "PIN must be exactly 6 digits" });
      return;
    }
    if (newPin !== confirmPin) {
      setError({ field: "confirm", message: "New PINs don't match" });
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/pin/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const message =
          typeof d?.error === "string" ? d.error : "Could not change PIN";
        setError({
          field:
            message === "Current PIN is incorrect"
              ? "current"
              : message === "New PIN must be different"
                ? "new"
                : "form",
          message,
        });
        return;
      }
      setDone(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setError({ field: "form", message: "Network error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="current-pin" className="text-sm font-black text-warm-deep">
          Current PIN
        </label>
        <input
          id="current-pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={currentPin}
          onChange={(event) => updatePin(setCurrentPin, event.target.value)}
          aria-invalid={error?.field === "current"}
          aria-describedby={error?.field === "current" ? "change-pin-error" : undefined}
          className="mt-1.5 min-h-12 w-full rounded-xl border border-warm-cream1 bg-white px-3 py-2.5 text-base font-black tracking-[0.35em] text-warm-deep outline-none focus:border-pop-pink focus:ring-2 focus:ring-pop-pink/15"
        />
      </div>
      <div>
        <label htmlFor="new-pin" className="text-sm font-black text-warm-deep">
          New PIN
        </label>
        <input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={newPin}
          onChange={(event) => updatePin(setNewPin, event.target.value)}
          aria-invalid={error?.field === "new"}
          aria-describedby={error?.field === "new" ? "change-pin-error" : undefined}
          className="mt-1.5 min-h-12 w-full rounded-xl border border-warm-cream1 bg-white px-3 py-2.5 text-base font-black tracking-[0.35em] text-warm-deep outline-none focus:border-pop-pink focus:ring-2 focus:ring-pop-pink/15"
        />
      </div>
      <div>
        <label htmlFor="confirm-pin" className="text-sm font-black text-warm-deep">
          Confirm new PIN
        </label>
        <input
          id="confirm-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={confirmPin}
          onChange={(event) => updatePin(setConfirmPin, event.target.value)}
          aria-invalid={error?.field === "confirm"}
          aria-describedby={error?.field === "confirm" ? "change-pin-error" : undefined}
          className="mt-1.5 min-h-12 w-full rounded-xl border border-warm-cream1 bg-white px-3 py-2.5 text-base font-black tracking-[0.35em] text-warm-deep outline-none focus:border-pop-pink focus:ring-2 focus:ring-pop-pink/15"
        />
      </div>
      {error && (
        <div id="change-pin-error" className="text-sm font-bold text-red-700" role="alert">
          {error.message}
        </div>
      )}
      {done && (
        <div className="text-sm font-bold text-green-700" role="status">
          PIN updated.
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-full bg-warm-deep px-5 py-2 text-sm font-black text-pop-cream transition hover:bg-warm-deep/90 disabled:opacity-50"
      >
        {pending ? "Updating..." : "Update PIN"}
      </button>
    </form>
  );
}
