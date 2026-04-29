"use client";

import { useState } from "react";

export interface PendingBooking {
  id: string;
  customer_name: string;
  service_name: string;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // "10:00 AM"
  deposit_amount: number | null;
  created_at: string;
}

interface PendingPaymentsListProps {
  pending: PendingBooking[];
  onMarkReceived: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PendingPaymentsList({ pending, onMarkReceived, onCancel }: PendingPaymentsListProps) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (pending.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between rounded-full bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] border border-[color:var(--admin-primary-border)] px-3 py-2 text-sm font-semibold"
      >
        <span>🕐 {pending.length} pending payment{pending.length === 1 ? "" : "s"}</span>
        <span>{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-2">
          {pending.map((b) => (
            <div key={b.id} className="bg-white rounded border-l-4 border-amber-500 p-2 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-gray-900">
                  {b.customer_name} · {new Date(b.booking_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, {b.booking_time}
                </span>
                <span className="text-gray-400 text-[10px]">{timeAgo(b.created_at)}</span>
              </div>
              <div className="text-gray-500 mt-0.5">
                {b.service_name} · Deposit: <span className="text-[var(--admin-primary)] font-semibold">${(b.deposit_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={async () => {
                    setBusyId(b.id);
                    try { await onMarkReceived(b.id); } finally { setBusyId(null); }
                  }}
                  className="flex-1 rounded bg-green-600 text-white px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Mark deposit received
                </button>
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={async () => {
                    if (!confirm("Cancel this booking?")) return;
                    setBusyId(b.id);
                    try { await onCancel(b.id); } finally { setBusyId(null); }
                  }}
                  className="rounded bg-white border border-red-300 text-red-600 px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
