import { ClientActions } from "../clients/ClientActions";
import { GoLiveChecklist } from "../clients/GoLiveChecklist";
import type { Tenant } from "../_lib/tenants";
import type { ManualState } from "@/lib/go-live-checklist";

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    trialing: "bg-blue-100 text-blue-700",
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

export function TenantTable({
  tenants,
  emptyMessage,
  goLive,
}: {
  tenants: Tenant[];
  emptyMessage: React.ReactNode;
  goLive?: Record<string, { seoLocality: string | null; checklist: ManualState }>;
}) {
  if (tenants.length === 0) {
    return (
      <div className="rounded-xl border bg-white py-16 text-center">
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3">Business</th>
              <th className="px-5 py-3">Status</th>
              {goLive && <th className="px-5 py-3">Go-live</th>}
              <th className="px-5 py-3">Since</th>
              <th className="px-5 py-3">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((tenant) => {
              const gl = goLive?.[tenant.id];
              return (
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
                  {goLive && (
                    <td className="px-5 py-4">
                      {gl && (
                        <GoLiveChecklist
                          key={tenant.id}
                          tenantId={tenant.id}
                          isDemo={tenant.is_demo}
                          customDomain={tenant.custom_domain}
                          subdomain={tenant.subdomain}
                          seoLocality={gl.seoLocality}
                          initialChecklist={gl.checklist}
                        />
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
                    {timeAgo(tenant.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <ClientActions
                      tenantId={tenant.id}
                      businessName={tenant.business_name}
                      subdomain={tenant.subdomain}
                      customDomain={tenant.custom_domain}
                      sitePublished={tenant.site_published}
                      isDemo={tenant.is_demo}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {tenants.map((tenant) => {
          const gl = goLive?.[tenant.id];
          return (
            <div key={tenant.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {tenant.business_name}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {tenant.owner_name}
                  </p>
                  {tenant.phone && (
                    <a
                      href={`tel:${tenant.phone}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {tenant.phone}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {statusBadge(tenant.subscription_status)}
                  {goLive && gl && (
                    <GoLiveChecklist
                      key={tenant.id}
                      tenantId={tenant.id}
                      isDemo={tenant.is_demo}
                      customDomain={tenant.custom_domain}
                      subdomain={tenant.subdomain}
                      seoLocality={gl.seoLocality}
                      initialChecklist={gl.checklist}
                    />
                  )}
                  <span className="text-xs text-gray-400">
                    {timeAgo(tenant.created_at)}
                  </span>
                </div>
              </div>
              <div className="mt-3 border-t pt-3">
                <ClientActions
                  tenantId={tenant.id}
                  businessName={tenant.business_name}
                  subdomain={tenant.subdomain}
                  customDomain={tenant.custom_domain}
                  sitePublished={tenant.site_published}
                  isDemo={tenant.is_demo}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
