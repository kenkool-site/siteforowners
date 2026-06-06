import type { SupabaseClient } from "@supabase/supabase-js";

/** Preview-only "pending" settings the founder configures before activation. */
export interface PreviewPendingSettings {
  business_name: string | null;
  booking_mode: string | null;
  notification_email: string | null;
  deposit_required: boolean | null;
  deposit_mode: string | null;
  deposit_value: number | null;
  deposit_cashapp: string | null;
  deposit_zelle: string | null;
  deposit_other_label: string | null;
  deposit_other_value: string | null;
}

export interface TenantRowInput {
  previewSlug: string;
  businessName: string;
  ownerName: string;
  status: string; // "trialing" (demo) | "active" (paid)
  isDemo: boolean;
  bookingMode: string;
  email: string | null;
  subdomain?: string | null;
  sitePublished?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Shape the `tenants` row for an insert or update. Optional fields are omitted
 * entirely when not supplied so an update never clobbers an existing subdomain /
 * publish flag with null (the webhook upgrade path passes no subdomain).
 */
export function buildTenantRow(input: TenantRowInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    business_name: input.businessName || "Unknown",
    owner_name: input.ownerName || input.businessName || "Owner",
    preview_slug: input.previewSlug,
    subscription_status: input.status,
    is_demo: input.isDemo,
    booking_mode: input.bookingMode || "in_site_only",
    email: input.email,
  };
  if (input.subdomain !== undefined) row.subdomain = input.subdomain;
  if (input.sitePublished !== undefined) row.site_published = input.sitePublished;
  if (input.stripeCustomerId !== undefined) row.stripe_customer_id = input.stripeCustomerId;
  if (input.stripeSubscriptionId !== undefined) row.stripe_subscription_id = input.stripeSubscriptionId;
  return row;
}

/** Shape the `booking_settings` upsert row from pending deposit settings. */
export function buildBookingSettingsRow(
  tenantId: string,
  previewSlug: string,
  pending: PreviewPendingSettings,
  nowIso: string,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    preview_slug: previewSlug,
    deposit_required: !!pending.deposit_required,
    deposit_mode: pending.deposit_mode,
    deposit_value: pending.deposit_value,
    deposit_cashapp: pending.deposit_cashapp,
    deposit_zelle: pending.deposit_zelle,
    deposit_other_label: pending.deposit_other_label,
    deposit_other_value: pending.deposit_other_value,
    updated_at: nowIso,
  };
}

const PENDING_COLUMNS =
  "business_name, booking_mode, notification_email, deposit_required, deposit_mode, deposit_value, deposit_cashapp, deposit_zelle, deposit_other_label, deposit_other_value";

export interface ProvisionArgs {
  previewSlug: string;
  status: string;
  isDemo: boolean;
  subdomain?: string | null;
  sitePublished?: boolean;
  ownerName?: string | null;
  businessNameOverride?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Create or upgrade the tenant for a preview, idempotent by `preview_slug`:
 * - No existing tenant → INSERT.
 * - Existing tenant → UPDATE in place (used by the paid webhook to upgrade a
 *   demo: sets status/stripe ids/is_demo without clobbering the subdomain).
 * Then upsert `booking_settings` from the preview's pending deposit fields.
 */
export async function provisionTenantFromPreview(
  supabase: SupabaseClient,
  args: ProvisionArgs,
): Promise<{ tenantId: string }> {
  const { data: pending } = await supabase
    .from("previews")
    .select(PENDING_COLUMNS)
    .eq("slug", args.previewSlug)
    .maybeSingle();

  const p = (pending as PreviewPendingSettings | null) ?? {
    business_name: null, booking_mode: null, notification_email: null,
    deposit_required: null, deposit_mode: null, deposit_value: null,
    deposit_cashapp: null, deposit_zelle: null, deposit_other_label: null, deposit_other_value: null,
  };

  const row = buildTenantRow({
    previewSlug: args.previewSlug,
    businessName: args.businessNameOverride || p.business_name || "Unknown",
    ownerName: args.ownerName || p.business_name || "Owner",
    status: args.status,
    isDemo: args.isDemo,
    bookingMode: p.booking_mode || "in_site_only",
    email: p.notification_email ?? null,
    subdomain: args.subdomain,
    sitePublished: args.sitePublished,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
  });

  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("preview_slug", args.previewSlug)
    .maybeSingle();

  let tenantId: string;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("tenants")
      .update(row)
      .eq("id", existing.id as string)
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("tenants")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id as string;
  }

  await supabase
    .from("booking_settings")
    .upsert(
      buildBookingSettingsRow(tenantId, args.previewSlug, p, new Date().toISOString()),
      { onConflict: "tenant_id" },
    );

  return { tenantId };
}
