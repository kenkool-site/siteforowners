import Link from "next/link";
import { getTenants, partitionTenants, clientStats } from "../_lib/tenants";
import { TenantTable } from "../_components/TenantTable";
import { StatCards } from "../_components/StatCards";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 0;

export default async function ClientsPage() {
  const { clients } = partitionTenants(await getTenants());
  const { activeClients, sitesLive, mrr } = clientStats(clients);

  // Look up seo_locality (lives on previews) for the "Local SEO area set" auto item.
  const slugs = clients
    .map((c) => c.preview_slug)
    .filter((s): s is string => !!s);
  const localityBySlug = new Map<string, string | null>();
  if (slugs.length) {
    const supabase = createAdminClient();
    const { data: previews } = await supabase
      .from("previews")
      .select("slug, seo_locality")
      .in("slug", slugs);
    for (const p of previews ?? []) {
      localityBySlug.set(p.slug as string, (p.seo_locality as string | null) ?? null);
    }
  }

  const goLive = Object.fromEntries(
    clients.map((c) => [
      c.id,
      {
        seoLocality: c.preview_slug ? localityBySlug.get(c.preview_slug) ?? null : null,
        checklist: c.go_live_checklist ?? {},
      },
    ]),
  );

  return (
    <div>
      <StatCards
        stats={[
          { label: "Active Clients", value: activeClients },
          { label: "Sites Live", value: sitesLive, tone: "green" },
          { label: "Monthly Revenue", value: `$${mrr}` },
        ]}
      />

      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-400">{clients.length} total</p>
      </div>

      <TenantTable
        tenants={clients}
        goLive={goLive}
        emptyMessage={
          <>
            No paying clients yet. Convert a{" "}
            <Link href="/demos" className="text-amber-600 underline">
              live demo
            </Link>{" "}
            or onboard a{" "}
            <Link href="/prospects" className="text-amber-600 underline">
              prospect
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
