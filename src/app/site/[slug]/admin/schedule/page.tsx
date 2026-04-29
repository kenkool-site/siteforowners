import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  getBookingsForRange,
  getBookingSettings,
  getBookingMode,
} from "@/lib/admin-bookings";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScheduleClient } from "./ScheduleClient";
import type { PendingBooking } from "./_components/PendingPaymentsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

export default async function SchedulePage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const bookingMode = await getBookingMode(tenant.preview_slug);
  if (bookingMode.mode === "external_only") {
    return (
      <div className="py-4 md:py-6">
        <div className="px-4 md:px-8">
          <div className="text-lg font-semibold">Schedule</div>
        </div>
        <div className="px-3 md:px-8 mt-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-sm text-gray-700">
              You manage bookings in <span className="font-semibold">{bookingMode.providerName}</span>.
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Appointments don&apos;t show up here — open {bookingMode.providerName} to view your calendar.
            </div>
            <a
              href={bookingMode.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg"
            >
              Open {bookingMode.providerName} ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  const weekStart = startOfWeekSunday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Fetch a slightly wider window so prev/next-week navigation has data
  // without a round-trip on first interaction.
  const fetchStart = new Date(weekStart);
  fetchStart.setDate(fetchStart.getDate() - 7);
  const fetchEnd = new Date(weekEnd);
  fetchEnd.setDate(fetchEnd.getDate() + 14);

  const [bookings, settings] = await Promise.all([
    getBookingsForRange(tenant.id, isoDate(fetchStart), isoDate(fetchEnd)),
    getBookingSettings(tenant.id),
  ]);

  const pendingSupabase = createAdminClient();
  const { data: pendingRows } = await pendingSupabase
    .from("bookings")
    .select("id, customer_name, service_name, booking_date, booking_time, deposit_amount, created_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const initialPending: PendingBooking[] = (pendingRows ?? []).map((r) => ({
    id: r.id as string,
    customer_name: r.customer_name as string,
    service_name: r.service_name as string,
    booking_date: r.booking_date as string,
    booking_time: r.booking_time as string,
    deposit_amount: r.deposit_amount as number | null,
    created_at: r.created_at as string,
  }));

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Schedule</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ScheduleClient
          initialWeekStart={isoDate(weekStart)}
          bookings={bookings}
          workingHours={settings?.working_hours ?? null}
          blockedDates={settings?.blocked_dates ?? []}
          initialPending={initialPending}
        />
      </div>
    </div>
  );
}
