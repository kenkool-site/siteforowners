"use client";

import { useState } from "react";

export function PinResetForm({ token }: { token: string }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-xs text-center">
        <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-700">
          Missing reset token. Please request a new reset link.
          <div className="mt-3">
            <a href="/admin/forgot-pin" className="text-[color:var(--admin-primary)] hover:underline">Request new link</a>
          </div>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPin: pin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || "Could not reset PIN");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-xs text-center">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-[color:var(--admin-primary)] font-semibold mb-2">PIN updated ✓</div>
          <div className="text-sm text-gray-700 mb-3">You can now sign in with your new PIN.</div>
          <a href="/admin" className="inline-block bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xs">
      <div className="text-center mb-5">
        <div className="text-[color:var(--admin-primary)] font-semibold text-lg">Set a new PIN</div>
        <div className="text-gray-500 text-sm mt-1">6 digits</div>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="New PIN"
          className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base text-center tracking-widest"
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
          className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base text-center tracking-widest"
        />
        {error && <div className="text-red-600 text-sm text-center" role="alert">{error}</div>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
        >
          {pending ? "Updating..." : "Set PIN"}
        </button>
      </form>
    </div>
  );
}
