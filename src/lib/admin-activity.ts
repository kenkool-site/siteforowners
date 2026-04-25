import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityEntry = {
  key: string;
  kind: "booking" | "order" | "lead";
  title: string;
  subtitle: string;
  at: string; // ISO timestamp
};

/** Up to `limit` most recent events across bookings, orders, contact_leads. */
export async function getRecentActivity(tenantId: string, limit = 5): Promise<ActivityEntry[]> {
  const supabase = createAdminClient();

  const [bookings, orders, leads] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, customer_name, service_name, booking_date, booking_time, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("orders")
      .select("id, customer_name, items, subtotal_cents, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("contact_leads")
      .select("id, name, message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const entries: ActivityEntry[] = [];

  for (const b of (bookings.data ?? []) as Array<{
    id: string; customer_name: string; service_name: string;
    booking_date: string; booking_time: string; created_at: string;
  }>) {
    entries.push({
      key: "b-" + b.id,
      kind: "booking",
      title: b.customer_name + " booked " + b.service_name,
      subtitle: b.booking_date + " · " + b.booking_time,
      at: b.created_at,
    });
  }

  for (const o of (orders.data ?? []) as Array<{
    id: string; customer_name: string; items: unknown;
    subtotal_cents: number; created_at: string;
  }>) {
    const itemCount = Array.isArray(o.items) ? o.items.length : 0;
    const dollars = (o.subtotal_cents / 100).toFixed(2);
    entries.push({
      key: "o-" + o.id,
      kind: "order",
      title: "New order from " + o.customer_name,
      subtitle: itemCount + " item" + (itemCount === 1 ? "" : "s") + " · $" + dollars,
      at: o.created_at,
    });
  }

  for (const l of (leads.data ?? []) as Array<{
    id: string; name: string; message: string | null; created_at: string;
  }>) {
    const preview = l.message
      ? '"' + l.message.slice(0, 60) + (l.message.length > 60 ? "…" : "") + '"'
      : "(no message)";
    entries.push({
      key: "l-" + l.id,
      kind: "lead",
      title: "Lead: " + preview,
      subtitle: "from " + l.name,
      at: l.created_at,
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}

/** Human-friendly relative time ("10 min ago"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " hr ago";
  const days = Math.round(hours / 24);
  if (days < 7) return days + " day" + (days === 1 ? "" : "s") + " ago";
  return new Date(iso).toLocaleDateString();
}
