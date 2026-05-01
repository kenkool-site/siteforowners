import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMockAdminData, type MockLead } from "@/lib/preview-admin-mock";

export const dynamic = "force-dynamic";

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

function MockLeadRow({ lead }: { lead: MockLead }) {
  return (
    <div className={"px-4 py-3 border-b border-gray-100 last:border-b-0 " + (lead.is_read ? "opacity-60" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            <span>{lead.name}</span>
            {!lead.is_read && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--admin-primary)] text-white">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            {lead.phone && <span className="text-[color:var(--admin-primary)]">{lead.phone}</span>}
            {lead.email && <span className="text-[color:var(--admin-primary)]">{lead.email}</span>}
            <span>{formatRelative(lead.created_at)}</span>
          </div>
          {lead.message && (
            <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{lead.message}</div>
          )}
          {lead.source_page && (
            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
              from {lead.source_page}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function PreviewAdminLeads({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createAdminClient();
  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name, business_type, services, checkout_mode")
    .eq("slug", params.slug)
    .single();

  if (!preview) notFound();

  const mock = buildMockAdminData({
    slug: preview.slug as string,
    business_name: preview.business_name as string | null,
    business_type: preview.business_type as string | null,
    services: (preview.services as Array<{ name: string; price?: string; durationMinutes?: number }> | null) || [],
    checkout_mode: preview.checkout_mode as string | null,
  });

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Leads</div>
        <div className="text-xs text-gray-500">{mock.leads.length} total</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        {mock.leads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No leads yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            {mock.leads.map((l) => (
              <MockLeadRow key={l.id} lead={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
