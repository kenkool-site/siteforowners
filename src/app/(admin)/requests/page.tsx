import { createAdminClient } from "@/lib/supabase/admin";
import { buildWizardPrefillUrl } from "@/lib/marketing-lead";
import { RequestActions } from "./RequestActions";

interface MarketingLead {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  business_address: string | null;
  business_type: string;
  business_link: string | null;
  notes: string | null;
  source: string;
  status: string;
  preview_group_id: string | null;
  created_at: string;
}

async function getRequests(): Promise<MarketingLead[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketing_leads")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to fetch marketing leads:", error);
    return [];
  }
  return (data || []) as MarketingLead[];
}

async function getRequestStats() {
  const supabase = createAdminClient();

  const { count: total } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weekCount } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString());

  const { count: newCount } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  return {
    total: total || 0,
    thisWeek: weekCount || 0,
    new: newCount || 0,
  };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const revalidate = 0;

export default async function RequestsPage() {
  const [leads, stats] = await Promise.all([getRequests(), getRequestStats()]);

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Requests</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">This Week</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.thisWeek}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">New</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{stats.new}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ad Requests</h1>
        <p className="text-sm text-gray-400">{leads.length} results</p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">
            No requests yet. They&rsquo;ll appear here when someone submits the
            &ldquo;Request yours&rdquo; form.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="hidden px-5 py-3 md:table-cell">Link</th>
                <th className="hidden px-5 py-3 lg:table-cell">Notes</th>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {lead.business_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {lead.business_type}
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                        {lead.source}
                      </span>
                    </p>
                    {lead.business_address && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {lead.business_address}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={`tel:${lead.phone}`}
                      className="block text-sm font-medium text-blue-600 hover:underline"
                    >
                      {lead.phone}
                    </a>
                    <a
                      href={`mailto:${lead.email}`}
                      className="block text-xs text-gray-400 hover:underline"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {lead.business_link ? (
                      <a
                        href={lead.business_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-amber-600 hover:underline"
                      >
                        Open link
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-5 py-4 text-sm text-gray-500 lg:table-cell">
                    {lead.notes || "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
                    {timeAgo(lead.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <RequestActions
                      leadId={lead.id}
                      previewHref={buildWizardPrefillUrl(lead)}
                      status={lead.status}
                      previewGroupId={lead.preview_group_id}
                    />
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
