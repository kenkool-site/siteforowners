import { createAdminClient } from "@/lib/supabase/admin";

export interface Tenant {
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
  is_demo: boolean;
  go_live_checklist?: Record<string, string> | null;
  created_at: string;
}

export async function getTenants(): Promise<Tenant[]> {
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

/**
 * Split tenants into real clients vs live demos. A "live demo" is a promoted
 * preview (`is_demo = true`); real clients are everything else (they flip to
 * `is_demo = false` when a subscription is paid).
 */
export function partitionTenants(tenants: Tenant[]): {
  clients: Tenant[];
  demos: Tenant[];
} {
  const clients: Tenant[] = [];
  const demos: Tenant[] = [];
  for (const t of tenants) {
    (t.is_demo ? demos : clients).push(t);
  }
  return { clients, demos };
}

export function clientStats(clients: Tenant[]): {
  activeClients: number;
  sitesLive: number;
  mrr: number;
} {
  const activeClients = clients.filter(
    (t) => t.subscription_status === "active",
  ).length;
  const sitesLive = clients.filter((t) => t.site_published).length;
  return { activeClients, sitesLive, mrr: activeClients * 50 };
}
