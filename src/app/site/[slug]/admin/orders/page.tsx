import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { notFound } from "next/navigation";
import { OrdersList } from "../_components/OrdersList";
import type { Order } from "../_components/OrderDetailDrawer";

export const dynamic = "force-dynamic";

async function getOrders(tenantId: string, tab: "active" | "history"): Promise<Order[]> {
  const supabase = createAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const query = supabase
    .from("orders")
    .select(
      "id, customer_name, customer_phone, customer_email, customer_notes, items, subtotal_cents, status, created_at"
    )
    .eq("tenant_id", tenantId);

  if (tab === "active") {
    query.in("status", ["new", "ready"]).order("created_at", { ascending: false });
  } else {
    query
      .in("status", ["picked_up", "canceled"])
      .lt("created_at", todayStartIso)
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/orders] fetch failed", { tenantId, tab, error });
    return [];
  }
  return (data ?? []) as Order[];
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const tab = searchParams.tab === "history" ? "history" : "active";
  const orders = await getOrders(tenant.id, tab);

  const tabClass = (active: boolean) =>
    "px-4 py-2 text-sm border-b-2 " +
    (active ? "border-pink-600 text-pink-700 font-medium" : "border-transparent text-gray-500");

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Orders</div>
      </div>
      <div className="px-4 md:px-8 mt-3 flex gap-2 border-b border-gray-200">
        <Link href="?tab=active" className={tabClass(tab === "active")}>
          Active
        </Link>
        <Link href="?tab=history" className={tabClass(tab === "history")}>
          History
        </Link>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <OrdersList initialOrders={orders} />
      </div>
    </div>
  );
}
