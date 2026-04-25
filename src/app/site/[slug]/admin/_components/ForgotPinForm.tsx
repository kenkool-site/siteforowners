"use client";

import { useState } from "react";

export function ForgotPinForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/admin/pin/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // don't leak; still show generic confirmation
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-xs">
      <div className="text-center mb-5">
        <div className="text-[color:var(--admin-primary)] font-semibold text-lg">Reset your PIN</div>
      </div>

      {submitted ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-700">
          If an account exists for that email, a reset link is on its way. The link expires in 15 minutes.
          <div className="mt-3">
            <a href="/admin" className="text-[color:var(--admin-primary)] hover:underline text-sm">Back to sign in</a>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email on file"
            className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base"
          />
          <button
            type="submit"
            disabled={pending || !email}
            className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            {pending ? "Sending..." : "Email me a reset link"}
          </button>
          <a href="/admin" className="block text-center text-sm text-gray-500 hover:underline">
            Back to sign in
          </a>
        </form>
      )}
    </div>
  );
}
