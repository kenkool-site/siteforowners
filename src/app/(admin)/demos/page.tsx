import Link from "next/link";
import { getTenants, partitionTenants } from "../_lib/tenants";
import { TenantTable } from "../_components/TenantTable";

export const revalidate = 0;

export default async function DemosPage() {
  const { demos } = partitionTenants(await getTenants());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Demos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Promoted previews running on the real backend. Use{" "}
            <span className="font-medium text-amber-700">Move to Prospect</span>{" "}
            to onboard one — it becomes a Client once they pay.
          </p>
        </div>
        <p className="text-sm text-gray-400">{demos.length} total</p>
      </div>

      <TenantTable
        tenants={demos}
        emptyMessage={
          <>
            No live demos. Promote one from the{" "}
            <Link href="/previews" className="text-amber-600 underline">
              previews page
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
