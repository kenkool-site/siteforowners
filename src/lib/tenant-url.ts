// Build customer-facing tenant URLs (public site root, owner admin, etc.)
// Uses the tenant's own canonical host so links sent in SMS / email show
// the owner's brand rather than the internal `/site/<slug>` rewrite path.
//
// Convention (matches ClientActions.tsx + middleware.ts):
//   - custom_domain wins when present (used as-stored; if the owner wants
//     `www.` prepended, they should store the value that way)
//   - subdomain falls back to `<sub>.siteforowners.com`
//   - When neither is set (preview-only tenant), build off APP_URL using
//     the internal `/site/<preview_slug>` path — the only URL that
//     resolves in that case

export interface TenantHostFields {
  custom_domain?: string | null;
  subdomain?: string | null;
  preview_slug?: string | null;
}

/**
 * Returns the canonical `https://<host>` root for a tenant, or null when
 * neither a custom domain nor a subdomain is configured (i.e. preview-only).
 * The caller can fall back to the APP_URL `/site/<slug>` path when null.
 */
export function tenantHostUrl(tenant: TenantHostFields): string | null {
  if (tenant.custom_domain) {
    const host = tenant.custom_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  if (tenant.subdomain) {
    return `https://${tenant.subdomain}.siteforowners.com`;
  }
  return null;
}

/**
 * Build a path on the tenant's canonical host. When the tenant has neither
 * custom_domain nor subdomain, falls back to `<appUrl>/site/<preview_slug><path>`
 * so internal preview-only sites still get a working URL.
 */
export function tenantUrl(
  appUrl: string,
  tenant: TenantHostFields,
  path: string,
): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const host = tenantHostUrl(tenant);
  if (host) return `${host}${cleanPath}`;
  if (tenant.preview_slug) {
    return `${appUrl.replace(/\/$/, "")}/site/${tenant.preview_slug}${cleanPath}`;
  }
  return `${appUrl.replace(/\/$/, "")}${cleanPath}`;
}
