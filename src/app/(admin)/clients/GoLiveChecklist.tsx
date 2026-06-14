"use client";

import { useState } from "react";
import {
  AUTO_ITEMS,
  MANUAL_ITEMS,
  deriveAuto,
  computeProgress,
  type ManualState,
} from "@/lib/go-live-checklist";

interface Props {
  tenantId: string;
  isDemo: boolean;
  customDomain: string | null;
  subdomain: string | null;
  seoLocality: string | null;
  initialChecklist: ManualState;
}

export function GoLiveChecklist({
  tenantId,
  isDemo,
  customDomain,
  subdomain,
  seoLocality,
  initialChecklist,
}: Props) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<ManualState>(initialChecklist || {});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoState = deriveAuto({ isDemo, customDomain, subdomain, seoLocality });
  const { done, total } = computeProgress(autoState, manual);
  const complete = done === total;

  async function toggle(itemId: string) {
    const wasDone = !!manual[itemId];
    const nextDone = !wasDone;
    setError(null);
    setSavingId(itemId);
    setManual((prev) => {
      const next = { ...prev };
      if (nextDone) next[itemId] = new Date().toISOString();
      else delete next[itemId];
      return next;
    });
    try {
      const res = await fetch("/api/update-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, item_id: itemId, done: nextDone }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      // rollback to previous state
      setManual((prev) => {
        const next = { ...prev };
        if (wasDone) next[itemId] = new Date().toISOString();
        else delete next[itemId];
        return next;
      });
      setError("Couldn't save — try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          complete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}
      >
        Go-live {done}/{total}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Go-live checklist</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              {done} of {total} complete
            </p>

            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Automatic
            </p>
            <ul className="mb-4 space-y-1.5">
              {AUTO_ITEMS.map((item) => {
                const ok = !!autoState[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className={ok ? "text-green-600" : "text-gray-300"}>
                      {ok ? "✓" : "○"}
                    </span>
                    <span className={ok ? "text-gray-900" : "text-gray-500"}>
                      {item.label}
                    </span>
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-400">
                      auto
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Manual
            </p>
            <ul className="space-y-1.5">
              {MANUAL_ITEMS.map((item) => {
                const checked = !!manual[item.id];
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={savingId === item.id}
                        onChange={() => toggle(item.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className={checked ? "text-gray-900" : "text-gray-600"}>
                        {item.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
