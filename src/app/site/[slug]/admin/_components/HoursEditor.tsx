"use client";

import { useState } from "react";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DEFAULT_HOURS: WorkingHours = {
  Monday: { open: "10:00 AM", close: "7:00 PM" },
  Tuesday: { open: "10:00 AM", close: "7:00 PM" },
  Wednesday: { open: "10:00 AM", close: "7:00 PM" },
  Thursday: { open: "10:00 AM", close: "7:00 PM" },
  Friday: { open: "10:00 AM", close: "7:00 PM" },
  Saturday: { open: "10:00 AM", close: "5:00 PM" },
  Sunday: null,
};

export function HoursEditor({ initial }: { initial: WorkingHours | null }) {
  const [hours, setHours] = useState<WorkingHours>(initial ?? DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setDay(day: string, next: DayHours | null) {
    setHours((h) => ({ ...h, [day]: next }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/bookings/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not save hours");
        return;
      }
      setSaved(true);
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {WEEKDAYS.map((day) => {
        const value = hours[day];
        const isClosed = value === null;
        return (
          <div key={day} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-24 text-sm font-medium">{day}</div>
            {isClosed ? (
              <div className="flex-1 text-sm text-gray-500">Closed</div>
            ) : (
              <div className="flex-1 flex items-center gap-2 text-sm">
                <input
                  type="text"
                  value={value!.open}
                  onChange={(e) => setDay(day, { open: e.target.value, close: value!.close })}
                  className="w-24 rounded border border-gray-200 px-2 py-1"
                  placeholder="10:00 AM"
                />
                <span>→</span>
                <input
                  type="text"
                  value={value!.close}
                  onChange={(e) => setDay(day, { open: value!.open, close: e.target.value })}
                  className="w-24 rounded border border-gray-200 px-2 py-1"
                  placeholder="7:00 PM"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setDay(day, isClosed ? { open: "10:00 AM", close: "5:00 PM" } : null)}
              className="text-xs text-[color:var(--admin-primary)] underline"
            >
              {isClosed ? "Open" : "Closed"}
            </button>
          </div>
        );
      })}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {saved ? "✓ Saved" : saving ? "Saving..." : " "}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Save hours
        </button>
      </div>
    </div>
  );
}
