import { revalidatePath } from "next/cache";

/**
 * The three guest-facing routes that render from getSiteData(slug)
 * (src/app/site/[slug]/getSiteData.ts). Call this after any write to the
 * previews, tenants, or booking_settings tables for a tenant whose site is
 * cached (revalidate = 3600 on all three pages) — without this, a save
 * would not show up on the live site for up to an hour.
 */
export function revalidateTenantSite(slug: string): void {
  revalidatePath(`/site/${slug}`);
  revalidatePath(`/site/${slug}/booking`);
  revalidatePath(`/site/${slug}/es`);
}
