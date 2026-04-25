import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type UpdateRequest = {
  id: string;
  category: string;
  description: string;
  attachment_url: string | null;
  status: "pending" | "in_progress" | "done";
  created_at: string;
  completed_at: string | null;
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-pink-100 text-pink-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

const CATEGORY_LABEL: Record<string, string> = {
  hours: "Hours",
  photo: "Photo",
  service: "Service",
  pricing: "Pricing",
  text: "Text",
  other: "Other",
};

function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24);
  if (d < 7) return d + " day" + (d === 1 ? "" : "s") + " ago";
  return new Date(iso).toLocaleDateString();
}

async function getRequests(tenantId: string): Promise<UpdateRequest[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("update_requests")
    .select("id, category, description, attachment_url, status, created_at, completed_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/updates] fetch failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as UpdateRequest[];
}

export default async function UpdatesPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const requests = await getRequests(tenant.id);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Update requests</div>
        <Link href="/admin/updates/new" className="text-xs text-pink-700 underline">+ New</Link>
      </div>
      <div className="px-4 md:px-8 mt-1 text-xs text-gray-500">
        Ask us to change something on your website.
      </div>

      <div className="px-3 md:px-8 mt-4">
        {requests.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No update requests yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            {requests.map((r) => (
              <div key={r.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Submitted {formatRelative(r.created_at)}
                      {r.attachment_url && " · with photo"}
                    </div>
                    <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                      {r.description}
                    </div>
                  </div>
                  <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap " + (STATUS_PILL[r.status] ?? STATUS_PILL.pending)}>
                    {r.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
