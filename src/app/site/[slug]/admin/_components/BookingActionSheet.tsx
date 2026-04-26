"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingRow as BookingRowType } from "@/lib/admin-bookings";
import { formatTimeRange } from "@/lib/availability";

export function BookingActionSheet({
  row,
  onClose,
  onStatusChange,
}: {
  row: BookingRowType;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(toStatus: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: row.id, toStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not update booking");
        return;
      }
      // Refresh server data so the calendar reflects the new status without
      // requiring a manual page reload.
      router.refresh();
      onStatusChange();
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
        <div className="text-sm font-semibold mb-3">
          {row.customer_name} · {formatTimeRange(row.booking_time, row.duration_minutes)}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("completed")}
            className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Mark completed
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("no_show")}
            className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Mark no-show
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("canceled")}
            className="w-full bg-white border border-red-600 text-red-600 font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <a
            href={"tel:" + row.customer_phone}
            className="block w-full text-center bg-white border border-[color:var(--admin-primary)] text-[color:var(--admin-primary)] font-medium py-3 rounded-lg"
          >
            📞 Call customer
          </a>
        </div>
      </div>
    </div>
  );
}
