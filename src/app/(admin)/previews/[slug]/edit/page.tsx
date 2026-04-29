import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteEditor } from "../../../clients/[tenantId]/edit/SiteEditor";
import type { DepositSettingsState } from "@/app/site/[slug]/admin/services/DepositEditor";

const DEFAULT_DEPOSIT: DepositSettingsState = {
  deposit_required: false,
  deposit_mode: null,
  deposit_value: null,
  deposit_instructions: null,
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

  // Create a minimal tenant-like object if no tenant exists
  const tenantData = tenant || {
    id: `preview-${slug}`,
    business_name: preview.business_name,
    subdomain: null,
  };

  // Spec 5: load deposit settings when a real tenant is present.
  let deposit: DepositSettingsState = DEFAULT_DEPOSIT;
  if (tenant) {
    const { data: bookingSettings } = await supabase
      .from("booking_settings")
      .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (bookingSettings) {
      deposit = {
        deposit_required: !!bookingSettings.deposit_required,
        deposit_mode: (bookingSettings.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: bookingSettings.deposit_value as number | null,
        deposit_instructions: (bookingSettings.deposit_instructions as string | null) ?? null,
      };
    }
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
