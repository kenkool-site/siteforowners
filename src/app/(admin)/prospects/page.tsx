import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { LeadActions } from "./LeadActions";

interface Lead {
  id: string;
  preview_slug: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  converted: boolean;
  created_at: string;
}

async function getLeads(): Promise<Lead[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("interested_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch leads:", error);
    return [];
  }
  return (data || []) as Lead[];
}

async function getLeadStats() {
  const supabase = createAdminClient();

  // Total leads
  const { count: total } = await supabase
    .from("interested_leads")
    .select("*", { count: "exact", head: true });

  // Today's leads
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from("interested_leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today.toISOString());

  // This week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weekCount } = await supabase
    .from("interested_leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString());

  return {
    total: total || 0,
    today: todayCount || 0,
    thisWeek: weekCount || 0,
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

export const revalidate = 0; // always fresh

export default async function ProspectsPage() {
  const [leads, stats] = await Promise.all([getLeads(), getLeadStats()]);

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Leads</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">This Week</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.thisWeek}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Today</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{stats.today}</p>
        </div>
      </div>

      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Interested Leads</h1>
        <p className="text-sm text-gray-400">{leads.length} results</p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">No leads yet. Share some previews!</p>
          <Link
            href="/preview"
            className="mt-4 inline-block rounded-full bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Create a Preview
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="hidden px-5 py-3 md:table-cell">Message</th>
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
                    <p className="text-xs text-gray-400">{lead.owner_name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={`tel:${lead.phone}`}
                      className="block text-sm font-medium text-blue-600 hover:underline"
                    >
                      {lead.phone}
                    </a>
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="block text-xs text-gray-400 hover:underline"
                      >
                        {lead.email}
                      </a>
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-5 py-4 text-sm text-gray-500 md:table-cell">
                    {lead.message || "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
                    {timeAgo(lead.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <LeadActions
                      leadId={lead.id}
                      previewSlug={lead.preview_slug}
                      businessName={lead.business_name}
                      ownerName={lead.owner_name}
                      phone={lead.phone}
                      email={lead.email}
                      converted={lead.converted}
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
