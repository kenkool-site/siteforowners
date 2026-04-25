"use client";

import { useState } from "react";

export function BillingPortalButton() {
  const [pending, setPending] = useState(false);

  async function open() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not open billing portal");
        return;
      }
      const data = await res.json();
      if (typeof data.url === "string") {
        window.location.href = data.url;
      } else {
        alert("Could not open billing portal");
      }
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
    >
      {pending ? "Opening..." : "Manage billing"}
    </button>
  );
}
