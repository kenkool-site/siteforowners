import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ClientActions } from "./ClientActions";

interface Tenant {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string | null;
  email: string | null;
  preview_slug: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  site_published: boolean;
  subscription_status: string;
  created_at: string;
}

async function getTenants(): Promise<Tenant[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch tenants:", error);
    return [];
  }
  return (data || []) as Tenant[];
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    past_due: "bg-yellow-100 text-yellow-700",
    canceled: "bg-red-100 text-red-700",
    pending: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        colors[status] || colors.pending
      }`}
    >
      {status}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const revalidate = 0;

export default async function ClientsPage() {
  const tenants = await getTenants();
  const active = tenants.filter((t) => t.subscription_status === "active").length;
  const published = tenants.filter((t) => t.site_published).length;
  const mrr = active * 50;

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Active Clients</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{active}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Sites Live</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{published}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Monthly Revenue</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">${mrr}</p>
        </div>
      </div>

      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-400">{tenants.length} total</p>
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">
            No clients yet. Onboard a prospect from the{" "}
            <Link href="/prospects" className="text-amber-600 underline">
              prospects page
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Status</th>
                <th className="hidden px-5 py-3 md:table-cell">Since</th>
                <th className="px-5 py-3">Site</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {tenant.business_name}
                    </p>
                    <p className="text-xs text-gray-400">{tenant.owner_name}</p>
                    {tenant.phone && (
                      <a
                        href={`tel:${tenant.phone}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {tenant.phone}
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {statusBadge(tenant.subscription_status)}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-4 text-xs text-gray-400 md:table-cell">
                    {timeAgo(tenant.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <ClientActions
                      tenantId={tenant.id}
                      businessName={tenant.business_name}
                      subdomain={tenant.subdomain}
                      customDomain={tenant.custom_domain}
                      sitePublished={tenant.site_published}
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
