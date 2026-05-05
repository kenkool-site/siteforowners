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
        className="flex w-full items-center justify-between rounded-[1.5rem] border border-pink-200 bg-pink-50 px-4 py-3 text-sm font-black text-pink-700 shadow-sm"
      >
        <span>{pending.length} pending payment{pending.length === 1 ? "" : "s"}</span>
        <span className="text-pop-pink">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-[1.5rem] border border-orange-200 bg-orange-50 p-2">
          {pending.map((b) => (
            <div key={b.id} className="rounded-2xl border-l-4 border-orange-500 bg-white p-3 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-black text-warm-deep">
                  {b.customer_name} · {new Date(b.booking_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, {b.booking_time}
                </span>
                <span className="text-[10px] font-bold text-warm-textMuted/70">{timeAgo(b.created_at)}</span>
              </div>
              <div className="mt-0.5 text-warm-textMuted">
                {b.service_name} · Deposit: <span className="font-black text-pop-pink">${(b.deposit_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={async () => {
                    setBusyId(b.id);
                    try { await onMarkReceived(b.id); } finally { setBusyId(null); }
                  }}
                  className="flex-1 rounded-full bg-green-600 px-2 py-2 text-xs font-black text-white disabled:opacity-50"
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
                  className="rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50"
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
