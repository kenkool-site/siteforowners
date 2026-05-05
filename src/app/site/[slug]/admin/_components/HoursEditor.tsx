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

const PRESETS: { label: string; hours: WorkingHours }[] = [
  {
    label: "Standard 10–7",
    hours: {
      Monday: { open: "10:00 AM", close: "7:00 PM" },
      Tuesday: { open: "10:00 AM", close: "7:00 PM" },
      Wednesday: { open: "10:00 AM", close: "7:00 PM" },
      Thursday: { open: "10:00 AM", close: "7:00 PM" },
      Friday: { open: "10:00 AM", close: "7:00 PM" },
      Saturday: { open: "10:00 AM", close: "5:00 PM" },
      Sunday: null,
    },
  },
  {
    label: "Early 8–5",
    hours: {
      Monday: { open: "8:00 AM", close: "5:00 PM" },
      Tuesday: { open: "8:00 AM", close: "5:00 PM" },
      Wednesday: { open: "8:00 AM", close: "5:00 PM" },
      Thursday: { open: "8:00 AM", close: "5:00 PM" },
      Friday: { open: "8:00 AM", close: "5:00 PM" },
      Saturday: null,
      Sunday: null,
    },
  },
  {
    label: "Closed weekends",
    hours: {
      Monday: { open: "10:00 AM", close: "7:00 PM" },
      Tuesday: { open: "10:00 AM", close: "7:00 PM" },
      Wednesday: { open: "10:00 AM", close: "7:00 PM" },
      Thursday: { open: "10:00 AM", close: "7:00 PM" },
      Friday: { open: "10:00 AM", close: "7:00 PM" },
      Saturday: null,
      Sunday: null,
    },
  },
];

// "10:00 AM" → "10:00" (24h)
function to24h(s: string): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return s;
  let h = Number(m[1]);
  const mi = m[2];
  const period = m[3].toUpperCase();
  if (h === 12) h = 0;
  if (period === "PM") h += 12;
  return `${h.toString().padStart(2, "0")}:${mi}`;
}

// "10:00" (24h) → "10:00 AM"
function to12h(s: string): string {
  const [hStr, mStr] = s.split(":");
  let h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr ?? "00"} ${period}`;
}

export function HoursEditor({ initial }: { initial: WorkingHours | null }) {
  const [hours, setHours] = useState<WorkingHours>(initial ?? DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setDay(day: string, next: DayHours | null) {
    setHours((h) => ({ ...h, [day]: next }));
    setSaved(false);
  }

  function applyPreset(preset: WorkingHours) {
    setHours(preset);
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
    <div className="overflow-hidden rounded-[1.5rem] border border-warm-cream1 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-warm-cream1 px-4 py-3">
        <span className="mr-1 text-xs font-bold text-warm-textMuted">Quick presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.hours)}
            className="rounded-full border border-warm-cream1 px-3 py-1.5 text-xs font-black text-warm-textMuted hover:bg-warm-cream2"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-warm-cream1">
        {WEEKDAYS.map((day) => {
          const value = hours[day];
          const isOpen = value !== null;
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="w-24 text-sm font-black text-warm-deep">{day}</div>
              <button
                type="button"
                onClick={() => setDay(day, isOpen ? null : { open: "10:00 AM", close: "7:00 PM" })}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${
                  isOpen
                    ? "bg-pink-50 text-pop-pink ring-1 ring-pink-100"
                    : "bg-warm-cream2 text-warm-textMuted"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </button>
              {isOpen && (
                <div className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="time"
                    step={3600}
                    value={to24h(value!.open)}
                    onChange={(e) => setDay(day, { open: to12h(e.target.value), close: value!.close })}
                    className="rounded-xl border border-warm-cream1 px-2 py-1 text-sm font-bold text-warm-deep"
                  />
                  <span className="font-bold text-warm-textMuted/60">→</span>
                  <input
                    type="time"
                    step={3600}
                    value={to24h(value!.close)}
                    onChange={(e) => setDay(day, { open: value!.open, close: to12h(e.target.value) })}
                    className="rounded-xl border border-warm-cream1 px-2 py-1 text-sm font-bold text-warm-deep"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-warm-cream1 px-4 py-3">
        <span className="text-xs font-bold text-warm-textMuted">
          {saved ? "✓ Saved" : saving ? "Saving..." : " "}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-full bg-pop-pink px-5 py-2.5 font-black text-pop-cream disabled:opacity-50"
        >
          Save hours
        </button>
      </div>
    </div>
  );
}
