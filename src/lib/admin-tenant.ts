import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminTenant } from "@/lib/admin-auth";

/**
 * Load a tenant by preview_slug, deduped per-request via React cache.
 * The admin layout and any child page/component can call this without
 * compounding Supabase round-trips.
 */
export const loadTenantBySlug = cache(async (slug: string): Promise<AdminTenant | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode, booking_mode"
    )
    .eq("preview_slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[admin-tenant] loadTenantBySlug failed", { slug, error });
  }
  return (data as AdminTenant) ?? null;
});
