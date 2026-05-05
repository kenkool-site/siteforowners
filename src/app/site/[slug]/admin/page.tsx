import { unstable_noStore as noStore } from "next/cache";
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
export const revalidate = 0;

export default async function AdminHome({ params }: { params: { slug: string } }) {
  noStore();
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
    bookingMode.mode !== "external_only" &&
    (!tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal");
  const visitStats = shapeVisits(visitRows, new Date());

  // Hrefs use the same /admin/* paths the AdminShell tabs use — middleware
  // rewrites the tenant-subdomain URL onto /site/<slug>/admin/* server-side,
  // so the client-visible URL is always /admin/...
  const cards: { value: number | string; label: string; href?: string }[] = [];
  if (showOrders) cards.push({ value: rollups.newOrders, label: "New orders", href: "/admin/orders" });
  if (showSchedule) {
    cards.push({ value: rollups.bookingsToday, label: "Bookings today", href: "/admin/schedule" });
    cards.push({ value: rollups.bookingsNext7Days, label: "Bookings next 7 days", href: "/admin/schedule" });
  }
  cards.push({ value: rollups.unreadLeads, label: "Unread leads", href: "/admin/leads" });

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4";
  const primaryActionHref = rollups.unreadLeads > 0 ? "/admin/leads" : showSchedule ? "/admin/schedule" : "/admin/updates";
  const primaryActionLabel = rollups.unreadLeads > 0 ? "Review leads" : showSchedule ? "Open schedule" : "Post update";
  const nextUpLabel = showSchedule
    ? `${rollups.bookingsToday} ${rollups.bookingsToday === 1 ? "booking" : "bookings"} today`
    : `${rollups.unreadLeads} unread ${rollups.unreadLeads === 1 ? "lead" : "leads"}`;

  return (
    <div className="px-4 py-4 md:px-8 md:py-6">
      <section className="overflow-hidden rounded-[2rem] bg-warm-deep p-6 text-pop-cream md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_14rem] md:items-start">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pop-pink">Today</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-5xl">
              <Greeting name={tenant.business_name} />
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-pop-cream/70">
              Here is what needs attention: bookings, leads, visitors, and recent customer activity.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={primaryActionHref}
                className="rounded-full bg-pop-pink px-5 py-3 text-sm font-black text-pop-cream transition hover:bg-pop-pink/90"
              >
                {primaryActionLabel}
              </a>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-pop-cream/20 px-5 py-3 text-sm font-black text-pop-cream transition hover:bg-pop-cream/10"
              >
                View site
              </a>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-pop-cream/15 bg-pop-cream/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pop-pink">Next up</p>
            <p className="mt-6 text-4xl font-black leading-none">{showSchedule ? rollups.bookingsToday : rollups.unreadLeads}</p>
            <p className="mt-2 text-sm font-semibold text-pop-cream/70">{nextUpLabel}</p>
          </div>
        </div>
      </section>

      <div className={"mt-4 grid gap-3 " + gridCols}>
        {cards.map((c) => (
          <StatCard key={c.label} value={c.value} label={c.label} fullWidth={cards.length === 1} href={c.href} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <VisitorsStrip stats={visitStats} thisMonth={monthlyVisits} />
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-warm-textMuted">
              Recent activity
            </h2>
            <span className="text-xs font-black text-pop-pink">Live feed</span>
          </div>
          <RecentActivity entries={activity} />
        </section>
      </div>
    </div>
  );
}
