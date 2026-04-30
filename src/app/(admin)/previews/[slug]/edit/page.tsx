import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteEditor } from "../../../clients/[tenantId]/edit/SiteEditor";
import type { DepositSettingsState } from "@/app/site/[slug]/admin/services/DepositEditor";

const DEFAULT_DEPOSIT: DepositSettingsState = {
  deposit_required: false,
  deposit_mode: null,
  deposit_value: null,
  deposit_cashapp: null,
  deposit_zelle: null,
  deposit_other_label: null,
  deposit_other_value: null,
};

async function getData(slug: string) {
  const supabase = createAdminClient();

  const { data: preview } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!preview) return null;

  // Check if a tenant exists for this preview
  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("preview_slug", slug)
    .single();

  // Create a minimal tenant-like object if no tenant exists. Pending
  // tenant-scoped fields (booking_mode, notification_email) live on the
  // previews row until activation; surface them through the synthetic
  // tenant so SiteEditor's existing initializers pick them up unchanged.
  const tenantData = tenant || {
    id: `preview-${slug}`,
    business_name: preview.business_name,
    subdomain: null,
    booking_mode: preview.booking_mode || "in_site_only",
    email: preview.notification_email || null,
  };

  // Deposit settings: canonical home is booking_settings (when a tenant
  // exists). For preview-only sites, the founder's pending values live
  // on the previews row and migrate on activation.
  let deposit: DepositSettingsState = DEFAULT_DEPOSIT;
  if (tenant) {
    const { data: bookingSettings } = await supabase
      .from("booking_settings")
      .select("deposit_required, deposit_mode, deposit_value, deposit_cashapp, deposit_zelle, deposit_other_label, deposit_other_value")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (bookingSettings) {
      deposit = {
        deposit_required: !!bookingSettings.deposit_required,
        deposit_mode: (bookingSettings.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: bookingSettings.deposit_value as number | null,
        deposit_cashapp: (bookingSettings.deposit_cashapp as string | null) ?? null,
        deposit_zelle: (bookingSettings.deposit_zelle as string | null) ?? null,
        deposit_other_label: (bookingSettings.deposit_other_label as string | null) ?? null,
        deposit_other_value: (bookingSettings.deposit_other_value as string | null) ?? null,
      };
    }
  } else {
    deposit = {
      deposit_required: !!preview.deposit_required,
      deposit_mode: (preview.deposit_mode as "fixed" | "percent" | null) ?? null,
      deposit_value: preview.deposit_value as number | null,
      deposit_cashapp: (preview.deposit_cashapp as string | null) ?? null,
      deposit_zelle: (preview.deposit_zelle as string | null) ?? null,
      deposit_other_label: (preview.deposit_other_label as string | null) ?? null,
      deposit_other_value: (preview.deposit_other_value as string | null) ?? null,
    };
  }

  return { tenant: tenantData, preview, deposit };
}

export const revalidate = 0;

export default async function PreviewEditPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getData(params.slug);

  if (!data) {
    notFound();
  }

  return <SiteEditor tenant={data.tenant} preview={data.preview} initialDeposit={data.deposit} />;
}
