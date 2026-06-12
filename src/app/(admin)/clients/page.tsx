import Link from "next/link";
import { getTenants, partitionTenants, clientStats } from "../_lib/tenants";
import { TenantTable } from "../_components/TenantTable";
import { StatCards } from "../_components/StatCards";

export const revalidate = 0;

export default async function ClientsPage() {
  const { clients } = partitionTenants(await getTenants());
  const { activeClients, sitesLive, mrr } = clientStats(clients);

  return (
    <div>
      <StatCards
        stats={[
          { label: "Active Clients", value: activeClients },
          { label: "Sites Live", value: sitesLive, tone: "green" },
          { label: "Monthly Revenue", value: `$${mrr}` },
        ]}
      />

      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-400">{clients.length} total</p>
      </div>

      <TenantTable
        tenants={clients}
        emptyMessage={
          <>
            No paying clients yet. Convert a{" "}
            <Link href="/demos" className="text-amber-600 underline">
              live demo
            </Link>{" "}
            or onboard a{" "}
            <Link href="/prospects" className="text-amber-600 underline">
              prospect
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
