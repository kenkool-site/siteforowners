import { createAdminClient } from "@/lib/supabase/admin";
import { type MarketingLeadRow } from "@/lib/marketing-lead";
import { RequestsTable } from "./RequestsTable";

async function getRequests(): Promise<MarketingLeadRow[]> {
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
  return (data || []) as MarketingLeadRow[];
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
        <RequestsTable leads={leads} />
      )}
    </div>
  );
}
