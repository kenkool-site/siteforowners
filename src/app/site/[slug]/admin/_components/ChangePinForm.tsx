"use client";

import { useState } from "react";

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(newPin)) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs don't match");
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
        setError(d?.error || "Could not change PIN");
        return;
      }
      setDone(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-semibold">Change PIN</div>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={currentPin}
        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Current PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={newPin}
        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
        placeholder="New PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={confirmPin}
        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Confirm new PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      {error && <div className="text-red-600 text-xs" role="alert">{error}</div>}
      {done && <div className="text-green-700 text-xs">✓ PIN updated</div>}
      <button
        type="submit"
        disabled={pending}
        className="bg-pink-600 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50 text-sm"
      >
        {pending ? "Updating..." : "Update PIN"}
      </button>
    </form>
  );
}
