import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";
import { ServicesClient } from "./ServicesClient";
import type { DepositSettingsState } from "./DepositEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_DEPOSIT: DepositSettingsState = {
  deposit_required: false,
  deposit_mode: null,
  deposit_value: null,
  deposit_instructions: null,
};

async function loadServices(
  previewSlug: string | null,
  tenantId: string | null,
): Promise<{
  services: ServiceItem[];
  categories: string[];
  bookingPolicies: string;
  deposit: DepositSettingsState;
}> {
  if (!previewSlug) {
    return { services: [], categories: [], bookingPolicies: "", deposit: EMPTY_DEPOSIT };
  }
  const supabase = createAdminClient();
  const primary = await supabase
    .from("previews")
    .select("services, categories, booking_policies")
    .eq("slug", previewSlug)
    .maybeSingle();
  let services: ServiceItem[] = [];
  let categories: string[] = [];
  let bookingPolicies = "";
  if (!primary.error) {
    services = (primary.data?.services as ServiceItem[] | null) ?? [];
    categories = (primary.data?.categories as string[] | null) ?? [];
    bookingPolicies = (primary.data?.booking_policies as string | null) ?? "";
  } else {
    const fallback = await supabase
      .from("previews")
      .select("services")
      .eq("slug", previewSlug)
      .maybeSingle();
    services = (fallback.data?.services as ServiceItem[] | null) ?? [];
  }

  let deposit: DepositSettingsState = EMPTY_DEPOSIT;
  if (tenantId) {
    const settings = await supabase
      .from("booking_settings")
      .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!settings.error && settings.data) {
      deposit = {
        deposit_required: !!settings.data.deposit_required,
        deposit_mode: (settings.data.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: settings.data.deposit_value as number | null,
        deposit_instructions: (settings.data.deposit_instructions as string | null) ?? null,
      };
    }
  }

  return { services, categories, bookingPolicies, deposit };
}

export default async function ServicesPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { services, categories, bookingPolicies, deposit } = await loadServices(
    tenant.preview_slug,
    tenant.id,
  );

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Services</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ServicesClient
          initialServices={services}
          initialCategories={categories}
          initialBookingPolicies={bookingPolicies}
          initialDeposit={deposit}
        />
      </div>
    </div>
  );
}
