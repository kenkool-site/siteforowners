"use client";

import { useState } from "react";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BlockDateDialog({ initial }: { initial: string[] }) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [blocked, setBlocked] = useState(initial);
  const [pending, setPending] = useState(false);

  async function mutate(mode: "add" | "remove", dates: string[]) {
    setPending(true);
    try {
      const res = await fetch("/api/admin/bookings/block-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dates }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not update");
        return;
      }
      const data = await res.json();
      setBlocked((data.blocked_dates as string[]) ?? []);
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-pink-700 underline"
      >
        + Block date
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold mb-3">Blocked dates</div>

            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-3 py-2 text-sm"
                min={todayIso()}
              />
              <button
                type="button"
                disabled={pending || !newDate}
                onClick={() => mutate("add", [newDate])}
                className="bg-pink-600 text-white font-medium px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {blocked.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-3">No blocked dates.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {blocked.map((d) => (
                  <div key={d} className="flex items-center justify-between py-2 text-sm">
                    <span>{d}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => mutate("remove", [d])}
                      className="text-xs text-red-600 underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-4 text-sm text-gray-600"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
