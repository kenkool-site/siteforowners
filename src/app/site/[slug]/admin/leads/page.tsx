import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { notFound } from "next/navigation";
import { LeadRow, Lead } from "../_components/LeadRow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getLeads(tenantId: string): Promise<Lead[]> {
  noStore();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contact_leads")
    .select("id, name, phone, email, message, source_page, is_read, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/leads] fetch failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as Lead[];
}

export default async function LeadsPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const leads = await getLeads(tenant.id);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Leads</div>
        <div className="text-xs text-gray-500">{leads.length} total</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        {leads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No leads yet. Messages from your contact form will show up here.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
