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
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-deep/50"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[2rem] bg-white p-4 md:mb-10 md:max-w-sm md:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded bg-warm-cream1 md:hidden" />
        <div className="mb-3 text-sm font-black text-warm-deep">
          {row.customer_name} · {formatTimeRange(row.booking_time, row.duration_minutes)}
          {row.status === "pending" && (
            <span className="ml-2 inline-block rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
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
              className="w-full rounded-full bg-green-600 py-3 font-black text-white disabled:opacity-50"
            >
              Mark deposit received
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("completed")}
                className="w-full rounded-full bg-pop-pink py-3 font-black text-pop-cream disabled:opacity-50"
              >
                Mark completed
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("no_show")}
                className="w-full rounded-full border border-warm-cream1 bg-white py-3 font-black text-warm-textMuted disabled:opacity-50"
              >
                Mark no-show
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setRescheduleOpen(true)}
            className="w-full rounded-full border border-warm-cream1 bg-white py-3 font-black text-warm-deep disabled:opacity-50"
          >
            Reschedule
            {row.reschedule_count >= 1 && <span className="ml-2 text-xs opacity-70">(already moved once)</span>}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("canceled")}
            className="w-full rounded-full border border-red-300 bg-white py-3 font-black text-red-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <a
            href={"tel:" + row.customer_phone}
            className="block w-full rounded-full border border-pink-200 bg-pink-50 py-3 text-center font-black text-pop-pink"
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
