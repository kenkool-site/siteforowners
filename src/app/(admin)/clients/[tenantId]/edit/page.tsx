import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteEditor } from "./SiteEditor";

async function getData(tenantId: string) {
  noStore();
  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (!tenant || !tenant.preview_slug) return null;

  const { data: preview } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", tenant.preview_slug)
    .single();

  if (!preview) return null;

  // Spec 5: deposit settings live on booking_settings, fetched separately
  // and passed to SiteEditor as a new prop. Returns nulls when no row.
  const { data: bookingSettings } = await supabase
    .from("booking_settings")
    .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const deposit = bookingSettings
    ? {
        deposit_required: !!bookingSettings.deposit_required,
        deposit_mode: (bookingSettings.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: bookingSettings.deposit_value as number | null,
        deposit_instructions: (bookingSettings.deposit_instructions as string | null) ?? null,
      }
    : {
        deposit_required: false,
        deposit_mode: null as "fixed" | "percent" | null,
        deposit_value: null as number | null,
        deposit_instructions: null as string | null,
      };

  return { tenant, preview, deposit };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditSitePage({
  params,
}: {
  params: { tenantId: string };
}) {
  noStore();
  const data = await getData(params.tenantId);

  if (!data) {
    notFound();
  }

  return (
    <SiteEditor
      tenant={data.tenant}
      preview={data.preview}
      initialDeposit={data.deposit}
    />
  );
}
