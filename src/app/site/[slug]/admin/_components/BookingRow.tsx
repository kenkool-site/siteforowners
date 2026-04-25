"use client";

import { useState } from "react";
import type { BookingRow as BookingRowType } from "@/lib/admin-bookings";

const STATUS_PILL: Record<string, string> = {
  confirmed: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-gray-200 text-gray-600",
  no_show: "bg-red-100 text-red-700",
  pending: "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]",
};

export function BookingRow({ row: initialRow }: { row: BookingRowType }) {
  const [row, setRow] = useState(initialRow);
  const [openSheet, setOpenSheet] = useState(false);
  const [pending, setPending] = useState(false);

  async function setStatus(toStatus: string) {
    if (pending) return;
    const prev = row;
    setRow({ ...row, status: toStatus });
    setOpenSheet(false);
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
        setRow(prev);
      }
    } catch {
      alert("Network error");
      setRow(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenSheet(true)}
        className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              {row.booking_time} · {row.customer_name}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {row.service_name} · {row.customer_phone}
            </div>
          </div>
          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (STATUS_PILL[row.status] ?? STATUS_PILL.confirmed)}>
            {row.status.replace("_", " ").toUpperCase()}
          </span>
        </div>
      </button>

      {openSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setOpenSheet(false)}
        >
          <div
            className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
            <div className="text-sm font-semibold mb-3">
              {row.customer_name} · {row.booking_time}
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setStatus("completed")}
                className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg"
              >
                Mark completed
              </button>
              <button
                type="button"
                onClick={() => setStatus("no_show")}
                className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 rounded-lg"
              >
                Mark no-show
              </button>
              <button
                type="button"
                onClick={() => setStatus("canceled")}
                className="w-full bg-white border border-red-600 text-red-600 font-medium py-3 rounded-lg"
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
      )}
    </>
  );
}
