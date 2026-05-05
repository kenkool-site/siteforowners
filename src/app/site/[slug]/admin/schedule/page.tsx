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
      <div className="px-4 py-5 md:px-8 md:py-8">
        <div className="rounded-[2rem] bg-warm-deep p-6 text-pop-cream md:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-pink">Schedule</p>
          <h1 className="mt-2 font-serif text-4xl font-black leading-none tracking-[-0.04em] md:text-5xl">
            Your bookings live elsewhere.
          </h1>
          <div className="mt-4 max-w-xl text-sm font-bold text-pop-cream/70">
            Open your connected booking tool to view and manage appointments.
          </div>
        </div>
        <div className="mt-4">
          <div className="rounded-[1.75rem] border border-warm-cream1 bg-white p-6 text-center">
            <div className="text-sm text-warm-text">
              You manage bookings in <span className="font-semibold">{bookingMode.providerName}</span>.
            </div>
            <div className="mt-1 text-xs text-warm-textMuted">
              Appointments don&apos;t show up here — open {bookingMode.providerName} to view your calendar.
            </div>
            <a
              href={bookingMode.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-full bg-pop-pink px-5 py-3 text-sm font-black text-pop-cream transition hover:bg-pink-700"
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
    <div className="px-4 py-5 md:px-8 md:py-8">
      <ScheduleClient
        initialWeekStart={isoDate(weekStart)}
        bookings={bookings}
        workingHours={settings?.working_hours ?? null}
        blockedDates={settings?.blocked_dates ?? []}
        initialPending={initialPending}
        slug={tenant.preview_slug ?? params.slug}
      />
    </div>
  );
}
