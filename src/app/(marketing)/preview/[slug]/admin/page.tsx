import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMockAdminData } from "@/lib/preview-admin-mock";
import { StatCard } from "@/app/site/[slug]/admin/_components/StatCard";
import { VisitorsStrip } from "@/app/site/[slug]/admin/_components/VisitorsStrip";
import { RecentActivity } from "@/app/site/[slug]/admin/_components/RecentActivity";
import { Greeting } from "@/app/site/[slug]/admin/_components/Greeting";

export const dynamic = "force-dynamic";

export default async function PreviewAdminHome({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createAdminClient();
  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name, business_type, services")
    .eq("slug", params.slug)
    .single();

  if (!preview) notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("checkout_mode")
    .eq("preview_slug", preview.slug as string)
    .maybeSingle();
  const checkoutMode = (tenant?.checkout_mode as string | null) ?? null;

  const mock = buildMockAdminData({
    slug: preview.slug as string,
    business_name: preview.business_name as string | null,
    business_type: preview.business_type as string | null,
    services: (preview.services as Array<{ name: string; price?: string; durationMinutes?: number }> | null) || [],
    checkout_mode: checkoutMode,
  });

  const prefix = `/preview/${preview.slug}/admin`;
  const showOrders = checkoutMode === "pickup";

  const cards: { value: number | string; label: string; href?: string }[] = [];
  if (showOrders) cards.push({ value: mock.rollups.newOrders, label: "New orders", href: `${prefix}/orders` });
  cards.push({ value: mock.rollups.bookingsToday, label: "Bookings today", href: `${prefix}/schedule` });
  cards.push({ value: mock.rollups.bookingsNext7Days, label: "Bookings next 7 days", href: `${prefix}/schedule` });
  cards.push({ value: mock.rollups.unreadLeads, label: "Unread leads", href: `${prefix}/leads` });

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4";

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">
          <Greeting name={(preview.business_name as string) || "there"} />
        </div>
        <div className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening today</div>
      </div>

      <div className={"grid gap-2.5 px-3 md:px-8 mt-4 " + gridCols}>
        {cards.map((c) => (
          <StatCard key={c.label} value={c.value} label={c.label} fullWidth={cards.length === 1} href={c.href} />
        ))}
      </div>

      <div className="md:px-8">
        <VisitorsStrip stats={mock.visits} thisMonth={mock.monthlyVisits} />
      </div>

      <div className="px-3 md:px-8 mt-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
          Recent activity
        </div>
        <RecentActivity entries={mock.activity} />
      </div>
    </div>
  );
}
