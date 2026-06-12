/**
 * Build an `interested_leads` row from a promoted-preview demo tenant so the
 * business re-enters the prospect funnel and can be onboarded from /prospects.
 *
 * Demos created via /api/admin/provision-demo have no lead row (the business
 * never submitted the wizard form), so the existing onboard flow — which is
 * keyed on a lead — can't reach them until one exists.
 */
export interface TenantLike {
  preview_slug: string | null;
  business_name: string | null;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
}

export function buildProspectLead(tenant: TenantLike): Record<string, unknown> {
  if (!tenant.preview_slug || !tenant.preview_slug.trim()) {
    throw new Error("preview_slug is required to move a demo to a prospect");
  }
  return {
    preview_slug: tenant.preview_slug,
    business_name: tenant.business_name || "Unknown",
    // interested_leads.owner_name is NOT NULL — fall back to the business name,
    // then a generic label when the demo has neither.
    owner_name: tenant.owner_name || tenant.business_name || "Owner",
    // interested_leads.phone is NOT NULL — a demo may have none yet.
    phone: tenant.phone || "",
    email: tenant.email || null,
  };
}
