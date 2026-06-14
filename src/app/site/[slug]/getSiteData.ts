import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { tenantUrl } from "@/lib/tenant-url";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

export type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

export type DepositSettings = {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_cashapp: string | null;
  deposit_zelle: string | null;
  deposit_other_label: string | null;
  deposit_other_value: string | null;
};

export interface SiteData {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  blockedDates: string[];
  tenantId: string | null;
  checkoutMode: "mockup" | "pickup";
  bookingMode: BookingModePolicy;
  depositSettings?: DepositSettings;
  isDemo: boolean;
  canonicalUrl: string;
}

/**
 * Loads everything a tenant site render needs for a given preview slug: the
 * preview content plus the owning tenant's booking hours, checkout/booking
 * modes, deposit settings, and canonical URL. Shared by the homepage route and
 * the `/booking` entry-point route so both render from one source of truth.
 */
export async function getSiteData(slug: string): Promise<SiteData | null> {
  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !preview) return null;

  // Find the tenant that owns this preview, if any, then load booking hours + checkout mode.
  let bookingHours: BookingHoursMap = null;
  let blockedDates: string[] = [];
  let tenantId: string | null = null;
  let checkoutMode: "mockup" | "pickup" = "mockup";
  let bookingMode: BookingModePolicy = "in_site_only";
  let depositSettings: DepositSettings | undefined;
  let isDemo = false;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, checkout_mode, booking_mode, is_demo, custom_domain, subdomain")
    .eq("preview_slug", slug)
    .maybeSingle();

  if (tenant?.id) {
    tenantId = tenant.id as string;
    isDemo = tenant.is_demo === true;
    const mode = tenant.checkout_mode as "mockup" | "pickup" | null;
    checkoutMode = mode === "pickup" ? "pickup" : "mockup";
    const rawBookingMode = tenant.booking_mode as string | null;
    if (rawBookingMode === "external_only" || rawBookingMode === "both") {
      bookingMode = rawBookingMode;
    }
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("working_hours, blocked_dates, deposit_required, deposit_mode, deposit_value, deposit_cashapp, deposit_zelle, deposit_other_label, deposit_other_value")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    bookingHours = (bs?.working_hours as BookingHoursMap) ?? null;
    blockedDates = (bs?.blocked_dates as string[] | null) ?? [];
    depositSettings = bs
      ? {
          deposit_required: !!bs.deposit_required,
          deposit_mode: (bs.deposit_mode as "fixed" | "percent" | null) ?? null,
          deposit_value: bs.deposit_value as number | null,
          deposit_cashapp: (bs.deposit_cashapp as string | null) ?? null,
          deposit_zelle: (bs.deposit_zelle as string | null) ?? null,
          deposit_other_label: (bs.deposit_other_label as string | null) ?? null,
          deposit_other_value: (bs.deposit_other_value as string | null) ?? null,
        }
      : undefined;
  }

  const canonicalUrl = tenantUrl(
    APP_URL,
    {
      custom_domain: (tenant?.custom_domain as string | null) ?? null,
      subdomain: (tenant?.subdomain as string | null) ?? null,
      preview_slug: slug,
    },
    "/",
  );

  return { preview: preview as PreviewData, bookingHours, blockedDates, tenantId, checkoutMode, bookingMode, depositSettings, isDemo, canonicalUrl };
}
