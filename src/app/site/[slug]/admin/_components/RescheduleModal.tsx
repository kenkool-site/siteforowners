"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingRow } from "@/lib/admin-bookings";

interface RescheduleModalProps {
  row: BookingRow;
  /** The tenant's preview_slug — passed to /api/available-slots as `slug`. */
  slug: string;
  onClose: () => void;
  onDone: () => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RescheduleModal({ row, slug, onClose, onDone }: RescheduleModalProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(row.booking_date);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{ customerName: string } | null>(null);

  // Build the next 30 days for the date strip.
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }

  useEffect(() => {
    setSelectedTime(null);
    setSlots([]);
    // available-slots expects: slug, date, duration_minutes, exclude_booking_id
    const url = `/api/available-slots?slug=${slug}&date=${selectedDate}&duration_minutes=${row.duration_minutes}&exclude_booking_id=${row.id}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSlots((data?.slots as string[]) ?? []))
      .catch(() => setSlots([]));
  }, [selectedDate, slug, row.id, row.duration_minutes]);

  async function submit(force: boolean) {
    if (!selectedTime || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/bookings/${row.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_date: selectedDate, new_time: selectedTime, force }),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        const conflictName = d?.conflict?.customer_name as string | undefined;
        if (conflictName) {
          setConflict({ customerName: conflictName });
        } else {
          // 409 without a conflict key = working hours / blocked date rejection
          // (T9 still enforces these even with force=true). Hard alert.
          alert(d?.error || "That slot isn't available.");
        }
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not reschedule");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-1">
          Move {row.customer_name}&rsquo;s booking
        </div>
        <div className="text-xs text-gray-600 mb-3">
          Currently: {row.booking_date} at {row.booking_time}
        </div>

        <div className="overflow-x-auto -mx-4 px-4 mb-3">
          <div className="flex gap-2">
            {dates.map((d) => {
              const iso = isoDate(d);
              const selected = iso === selectedDate;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={`flex-shrink-0 w-14 py-2 rounded-lg text-center text-xs ${selected ? "bg-[var(--admin-primary)] text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  <div className="opacity-80">{DAYS[d.getDay()]}</div>
                  <div className="font-semibold">{d.getDate()}</div>
                  <div className="opacity-60 text-[10px]">{MONTHS[d.getMonth()]}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 max-h-48 overflow-y-auto">
          {slots.length === 0 ? (
            <div className="col-span-3 text-xs text-gray-500 text-center py-4">No slots available on this date.</div>
          ) : slots.map((t) => {
            const selected = t === selectedTime;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTime(t)}
                className={`py-2 rounded-lg text-sm font-medium ${selected ? "bg-[var(--admin-primary)] text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {conflict && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3 text-sm">
            <p className="text-amber-900 mb-2">
              That slot has another booking with <strong>{conflict.customerName}</strong>. Schedule anyway?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setConflict(null); submit(true); }}
                className="flex-1 bg-amber-600 text-white py-2 rounded text-sm font-semibold"
              >
                Schedule anyway
              </button>
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="flex-1 bg-white border border-gray-300 py-2 rounded text-sm"
              >
                Pick another time
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedTime || submitting || conflict !== null}
            onClick={() => submit(false)}
            className="flex-1 bg-[var(--admin-primary)] text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
