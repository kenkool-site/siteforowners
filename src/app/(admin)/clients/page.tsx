import Link from "next/link";
import { getTenants, partitionTenants, clientStats } from "../_lib/tenants";
import { TenantTable } from "../_components/TenantTable";

export const revalidate = 0;

export default async function ClientsPage() {
  const { clients } = partitionTenants(await getTenants());
  const { activeClients, sitesLive, mrr } = clientStats(clients);

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Active Clients</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{activeClients}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Sites Live</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{sitesLive}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Monthly Revenue</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">${mrr}</p>
        </div>
      </div>

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
