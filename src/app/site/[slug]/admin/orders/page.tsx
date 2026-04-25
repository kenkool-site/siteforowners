import { createAdminClient } from "@/lib/supabase/admin";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { notFound } from "next/navigation";
import { OrdersList } from "../_components/OrdersList";
import { TabBar } from "../_components/TabBar";
import type { Order } from "../_components/OrderDetailDrawer";

export const dynamic = "force-dynamic";

const ORDER_COLUMNS =
  "id, customer_name, customer_phone, customer_email, customer_notes, items, subtotal_cents, status, created_at";

async function getOrders(tenantId: string, tab: "active" | "history"): Promise<Order[]> {
  const supabase = createAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  // Build in a single chain — supabase-js filter methods return a new
  // builder, so reassigning conditional filters via separate `.in()`
  // calls on a stored reference would silently drop them.
  const result = tab === "active"
    ? await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("status", ["new", "ready"])
        .order("created_at", { ascending: false })
    : await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("status", ["picked_up", "canceled"])
        .lt("created_at", todayStartIso)
        .order("created_at", { ascending: false });

  if (result.error) {
    console.error("[admin/orders] fetch failed", { tenantId, tab, error: result.error });
    return [];
  }
  return (result.data ?? []) as Order[];
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

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Orders</div>
      </div>
      <TabBar
        tabs={[{ value: "active", label: "Active" }, { value: "history", label: "History" }]}
        defaultValue="active"
      />
      <div className="px-3 md:px-8 mt-4">
        <OrdersList key={tab} initialOrders={orders} />
      </div>
    </div>
  );
}
