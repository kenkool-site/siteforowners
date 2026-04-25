import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  getTodayBookings,
  getUpcomingBookings,
  getBookingSettings,
  groupBookingsByDate,
  getBookingMode,
} from "@/lib/admin-bookings";
import { BookingRow } from "../_components/BookingRow";
import { HoursEditor } from "../_components/HoursEditor";
import { BlockDateDialog } from "../_components/BlockDateDialog";
import { TabBar } from "../_components/TabBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tab = "today" | "upcoming" | "hours";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  // External booking (Acuity / Booksy / etc.): we have nothing to show — bookings live there.
  // Replace the whole page with a friendly redirect note instead of a misleading "no bookings".
  const bookingMode = await getBookingMode(tenant.preview_slug);
  if (bookingMode.external) {
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

  const tab: Tab =
    searchParams.tab === "upcoming"
      ? "upcoming"
      : searchParams.tab === "hours"
      ? "hours"
      : "today";

  const settings = await getBookingSettings(tenant.id);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Schedule</div>
        <BlockDateDialog initial={settings?.blocked_dates ?? []} />
      </div>

      <TabBar
        tabs={[
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "hours", label: "Hours" },
        ]}
        defaultValue="today"
      />

      <div className="px-3 md:px-8 mt-4">
        {tab === "hours" ? (
          <HoursEditor initial={settings?.working_hours ?? null} />
        ) : (
          <ScheduleList tab={tab} tenantId={tenant.id} />
        )}
      </div>
    </div>
  );
}

async function ScheduleList({ tab, tenantId }: { tab: "today" | "upcoming"; tenantId: string }) {
  const rows = tab === "today"
    ? await getTodayBookings(tenantId)
    : await getUpcomingBookings(tenantId);

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
        {tab === "today" ? "No bookings today." : "No upcoming bookings."}
      </div>
    );
  }

  if (tab === "today") {
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        {rows.map((r) => <BookingRow key={r.id} row={r} />)}
      </div>
    );
  }

  const groups = groupBookingsByDate(rows);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 px-1">
            {g.date}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg">
            {g.rows.map((r) => <BookingRow key={r.id} row={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
