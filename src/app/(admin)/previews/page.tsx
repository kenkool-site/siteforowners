import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { PreviewsTable } from "./PreviewsTable";
import { StatCards } from "../_components/StatCards";

async function getPreviews() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("slug, business_name, business_type, template_variant, color_theme, group_id, variant_label, view_count, converted, is_selected, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to fetch previews:", error);
    return [];
  }
  return data || [];
}

async function getDemoTenantsBySlug(slugs: string[]): Promise<Record<string, { subdomain: string | null }>> {
  if (slugs.length === 0) return {};
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("preview_slug, subdomain, is_demo")
    .in("preview_slug", slugs)
    .eq("is_demo", true);
  const map: Record<string, { subdomain: string | null }> = {};
  for (const t of data || []) {
    if (t.preview_slug) map[t.preview_slug as string] = { subdomain: (t.subdomain as string | null) ?? null };
  }
  return map;
}

export const revalidate = 0;

export default async function PreviewsPage() {
  const previews = await getPreviews();
  const demoBySlug = await getDemoTenantsBySlug(previews.map((p) => p.slug));
  const businesses = new Set(previews.map((p) => p.business_name));
  const totalViews = previews.reduce((sum, p) => sum + (p.view_count || 0), 0);

  return (
    <div>
      <StatCards
        stats={[
          { label: "Total Previews", value: previews.length },
          { label: "Businesses", value: businesses.size },
          { label: "Total Views", value: totalViews, tone: "amber" },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Previews</h1>
        <Link
          href="/preview"
          className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + New Preview
        </Link>
      </div>

      {previews.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">No previews generated yet.</p>
        </div>
      ) : (
        <PreviewsTable previews={previews} demoBySlug={demoBySlug} />
      )}
    </div>
  );
}
