import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { PreviewsTable } from "./PreviewsTable";

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

export const revalidate = 0;

export default async function PreviewsPage() {
  const previews = await getPreviews();
  const businesses = new Set(previews.map((p) => p.business_name));
  const totalViews = previews.reduce((sum, p) => sum + (p.view_count || 0), 0);

  return (
    <div>
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Previews</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{previews.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Businesses</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{businesses.size}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Views</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{totalViews}</p>
        </div>
      </div>

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
        <PreviewsTable previews={previews} />
      )}
    </div>
  );
}
