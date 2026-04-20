import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

interface Preview {
  slug: string;
  business_name: string;
  business_type: string;
  template_variant: string | null;
  color_theme: string;
  group_id: string | null;
  variant_label: string | null;
  view_count: number;
  converted: boolean;
  is_selected: boolean | null;
  created_at: string;
}

async function getPreviews(): Promise<Preview[]> {
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
  return (data || []) as Preview[];
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TEMPLATE_LABELS: Record<string, string> = {
  classic: "Classic",
  bold: "Bold",
  elegant: "Elegant",
  vibrant: "Vibrant",
  warm: "Warm",
};

export const revalidate = 0;

export default async function PreviewsPage() {
  const previews = await getPreviews();

  // Group by business name for stats
  const businesses = new Set(previews.map((p) => p.business_name));
  const totalViews = previews.reduce((sum, p) => sum + (p.view_count || 0), 0);

  return (
    <div>
      {/* Stats */}
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
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Template</th>
                <th className="hidden px-5 py-3 md:table-cell">Views</th>
                <th className="hidden px-5 py-3 md:table-cell">Status</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {previews.map((p) => (
                <tr key={p.slug} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-gray-900">{p.business_name}</p>
                    <p className="text-xs text-gray-400">{p.business_type}{p.variant_label ? ` · Variant ${p.variant_label}` : ""}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {TEMPLATE_LABELS[p.template_variant || ""] || p.template_variant || "—"}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3 text-sm text-gray-500 md:table-cell">
                    {p.view_count || 0}
                  </td>
                  <td className="hidden px-5 py-3 md:table-cell">
                    {p.converted ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Converted</span>
                    ) : p.is_selected ? (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Selected</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-gray-400">
                    {timeAgo(p.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/preview/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        View
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(`https://www.siteforowners.com/preview/${p.slug}`)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        Copy Link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
