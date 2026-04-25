import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  getTodayBookings,
  getUpcomingBookings,
  getBookingSettings,
  groupBookingsByDate,
} from "@/lib/admin-bookings";
import { BookingRow } from "../_components/BookingRow";
import { HoursEditor } from "../_components/HoursEditor";
import { BlockDateDialog } from "../_components/BlockDateDialog";
import { TabBar } from "../_components/TabBar";

export const dynamic = "force-dynamic";

type Tab = "today" | "upcoming" | "hours";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

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
