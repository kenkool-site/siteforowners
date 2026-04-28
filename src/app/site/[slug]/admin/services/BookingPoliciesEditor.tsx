"use client";

import { useState } from "react";

interface BookingPoliciesEditorProps {
  value: string;
  onChange: (next: string) => void;
}

const MAX_LENGTH = 10000;

export function BookingPoliciesEditor({ value, onChange }: BookingPoliciesEditorProps) {
  // Start collapsed when content already exists so the section doesn't
  // dominate the page after the owner reloads. Empty + collapsed = the
  // initial "+ Add" prompt.
  const [expanded, setExpanded] = useState(false);
  const headline = (value.split("\n").find((l) => l.trim().length > 0) ?? "").trim();

  // Collapsed, no content → compact CTA prompt.
  if (!expanded && !value.trim()) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left text-sm text-gray-600 hover:border-gray-300"
      >
        <span className="font-semibold text-gray-700">+ Add booking policies</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          Deposit, lateness, reschedule rules — shown to customers when they pick a time.
        </span>
      </button>
    );
  }

  // Collapsed with content → summary card showing the headline + Edit.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left hover:border-gray-300"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Booking policies
          </span>
          <span className="text-xs text-[var(--admin-primary)] font-medium">
            Edit ▾
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
          {headline}
        </p>
      </button>
    );
  }

  // Expanded — textarea + Done button to collapse.
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Booking policies
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            {value.length}/{MAX_LENGTH.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-[var(--admin-primary)] font-medium"
          >
            Done ▴
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={"e.g.\n$40 non-refundable deposit required to confirm.\n- One reschedule allowed with the deposit.\n- Balance due in cash at the time of service."}
        rows={6}
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm font-mono leading-snug"
      />
      <div className="text-[10px] text-gray-500">
        First non-empty line shows as the inline headline on the booking screen ({headline ? `"${headline.slice(0, 60)}${headline.length > 60 ? "…" : ""}"` : "no headline yet"}). Customers tap to view the full text.
      </div>
    </div>
  );
}
