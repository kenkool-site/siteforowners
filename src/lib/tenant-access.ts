/**
 * Tenant access decisions for `src/middleware.ts` — kept as pure functions so
 * the gating policy is testable in isolation (middleware itself is hard to unit
 * test). The middleware resolves a tenant from the Host header, then uses these
 * to decide whether to serve the public site, the owner admin, or `/not-found`.
 */

// Subscription statuses for which a tenant's PUBLIC site stays live.
//
// `past_due` is included deliberately: it is Stripe's dunning/grace window after
// a failed renewal — including charges Stripe itself blocks at high risk, which
// is not the client's fault. A single failed charge must NOT take a paying
// client's entire site to a 404 while billing is retried/resolved. Only the
// terminal states (`canceled`, `unpaid`) and never-activated ones
// (`incomplete`, `incomplete_expired`, `paused`) gate the public site.
export const PUBLIC_LIVE_STATUSES: readonly string[] = [
  "active",
  "trialing",
  "past_due",
];

export type TenantAccessRow = {
  preview_slug: string | null;
  site_published: boolean | null;
  subscription_status: string | null;
} | null;

/**
 * The public site is reachable when the tenant exists, is published, has a
 * rendered preview to serve, and its subscription is in a live (or grace) state.
 */
export function isPublicSiteLive(tenant: TenantAccessRow): boolean {
  return (
    !!tenant &&
    !!tenant.site_published &&
    !!tenant.preview_slug &&
    PUBLIC_LIVE_STATUSES.includes(tenant.subscription_status ?? "")
  );
}

/**
 * Owner admin stays reachable even when the site is unpublished or the
 * subscription has lapsed — so owners can always reach Billing and fix it. It
 * only requires a real tenant with a rendered site.
 */
export function isOwnerAdminReachable(tenant: TenantAccessRow): boolean {
  return !!tenant && !!tenant.preview_slug;
}
