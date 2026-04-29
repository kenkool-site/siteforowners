"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingRow as BookingRowType } from "@/lib/admin-bookings";
import { formatTimeRange } from "@/lib/availability";
import { RescheduleModal } from "./RescheduleModal";

export function BookingActionSheet({
  row,
  slug,
  onClose,
  onStatusChange,
}: {
  row: BookingRowType;
  slug: string;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

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
    <>
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
          {row.status === "pending" && (
            <span className="ml-2 inline-block bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
              Pending
            </span>
          )}
        </div>
        <div className="space-y-2">
          {row.status === "pending" ? (
            // Pending booking — only valid transitions are confirmed | canceled.
            // Mark deposit received is the primary action; cancel is secondary.
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus("confirmed")}
              className="w-full bg-green-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
            >
              Mark deposit received
            </button>
          ) : (
            <>
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
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setRescheduleOpen(true)}
            className="w-full bg-white border border-blue-600 text-blue-600 font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Reschedule
            {row.reschedule_count >= 1 && <span className="ml-2 text-xs opacity-70">(already moved once)</span>}
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
    {rescheduleOpen && (
      <RescheduleModal
        row={row}
        slug={slug}
        onClose={() => setRescheduleOpen(false)}
        onDone={() => {
          setRescheduleOpen(false);
          onStatusChange();
        }}
      />
    )}
    </>
  );
}
