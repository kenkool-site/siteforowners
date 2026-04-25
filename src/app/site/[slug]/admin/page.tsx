import { loadTenantBySlug } from "@/lib/admin-tenant";
import { getRollups } from "@/lib/admin-rollups";
import { getRecentVisits, shapeVisits, getMonthlyVisitCount } from "@/lib/admin-visits";
import { getRecentActivity } from "@/lib/admin-activity";
import { getBookingMode } from "@/lib/admin-bookings";
import { StatCard } from "./_components/StatCard";
import { VisitorsStrip } from "./_components/VisitorsStrip";
import { RecentActivity } from "./_components/RecentActivity";
import { Greeting } from "./_components/Greeting";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHome({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const showOrders = tenant.checkout_mode === "pickup";

  const [rollups, visitRows, activity, monthlyVisits, bookingMode] = await Promise.all([
    getRollups(tenant.id),
    getRecentVisits(tenant.id),
    getRecentActivity(tenant.id),
    getMonthlyVisitCount(tenant.id),
    getBookingMode(tenant.preview_slug),
  ]);

  // Internal booking tab visibility now driven by the actual booking URL
  // (same source the public site uses). If the tenant has Acuity / Booksy /
  // etc. configured, hide the booking rollups since they'd always be 0.
  const showSchedule =
    !bookingMode.external &&
    (!tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal");
  const visitStats = shapeVisits(visitRows, new Date());

  const cards: { value: number | string; label: string }[] = [];
  if (showOrders) cards.push({ value: rollups.newOrders, label: "New orders" });
  if (showSchedule) {
    cards.push({ value: rollups.bookingsToday, label: "Bookings today" });
    cards.push({ value: rollups.bookingsThisWeek, label: "Bookings this week" });
  }
  cards.push({ value: rollups.unreadLeads, label: "Unread leads" });

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4";

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">
          <Greeting name={tenant.business_name} />
        </div>
        <div className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening today</div>
      </div>

      <div className={"grid gap-2.5 px-3 md:px-8 mt-4 " + gridCols}>
        {cards.map((c) => (
          <StatCard key={c.label} value={c.value} label={c.label} fullWidth={cards.length === 1} />
        ))}
      </div>

      <div className="md:px-8">
        <VisitorsStrip stats={visitStats} thisMonth={monthlyVisits} />
      </div>

      <div className="px-3 md:px-8 mt-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
          Recent activity
        </div>
        <RecentActivity entries={activity} />
      </div>
    </div>
  );
}
