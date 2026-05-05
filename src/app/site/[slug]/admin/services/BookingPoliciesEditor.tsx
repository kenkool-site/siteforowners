"use client";

import { useState } from "react";

interface BookingPoliciesEditorProps {
  value: string;
  onChange: (next: string) => void;
}

const MAX_LENGTH = 10000;

export function BookingPoliciesEditor({ value, onChange }: BookingPoliciesEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const headline = (value.split("\n").find((l) => l.trim().length > 0) ?? "").trim();

  if (!expanded && !value.trim()) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-[1.75rem] border border-warm-cream1 bg-white p-4 text-left text-sm font-bold text-warm-textMuted transition hover:border-pink-200"
      >
        <span className="font-black text-warm-deep">+ Add booking policies</span>
        <span className="mt-0.5 block text-xs text-warm-textMuted">
          Deposit, lateness, reschedule rules — shown to customers when they pick a time.
        </span>
      </button>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-[1.75rem] border border-warm-cream1 bg-white p-4 text-left transition hover:border-pink-200"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">Booking policies</span>
          <span className="text-xs font-black text-pop-pink">Edit ▾</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-bold text-warm-textMuted">{headline}</p>
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-[1.75rem] border border-warm-cream1 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">Booking policies</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-warm-textMuted/70">
            {value.length}/{MAX_LENGTH.toLocaleString()}
          </span>
          <button type="button" onClick={() => setExpanded(false)} className="text-xs font-black text-pop-pink">
            Done ▴
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={
          "e.g.\n$40 non-refundable deposit required to confirm.\n- One reschedule allowed with the deposit.\n- Balance due in cash at the time of service."
        }
        rows={6}
        className="w-full rounded-xl border border-warm-cream1 px-3 py-2 font-mono text-sm leading-snug text-warm-deep"
      />
      <div className="text-[10px] font-bold text-warm-textMuted">
        First non-empty line shows as the inline headline on the booking screen (
        {headline ? `"${headline.slice(0, 60)}${headline.length > 60 ? "…" : ""}"` : "no headline yet"}). Customers tap to view
        the full text.
      </div>
    </div>
  );
}
