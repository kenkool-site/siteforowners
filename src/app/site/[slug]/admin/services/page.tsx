import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";
import { ServicesClient } from "./ServicesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadServices(
  previewSlug: string | null,
): Promise<{ services: ServiceItem[]; categories: string[]; bookingPolicies: string }> {
  if (!previewSlug) return { services: [], categories: [], bookingPolicies: "" };
  const supabase = createAdminClient();
  const primary = await supabase
    .from("previews")
    .select("services, categories, booking_policies")
    .eq("slug", previewSlug)
    .maybeSingle();
  if (!primary.error) {
    return {
      services: (primary.data?.services as ServiceItem[] | null) ?? [],
      categories: (primary.data?.categories as string[] | null) ?? [],
      bookingPolicies: (primary.data?.booking_policies as string | null) ?? "",
    };
  }
  // Fallback: one of the newer columns (categories, booking_policies) may
  // not exist yet in this environment. Re-query services alone so the admin
  // page still works.
  const fallback = await supabase
    .from("previews")
    .select("services")
    .eq("slug", previewSlug)
    .maybeSingle();
  return {
    services: (fallback.data?.services as ServiceItem[] | null) ?? [],
    categories: [],
    bookingPolicies: "",
  };
}

export default async function ServicesPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { services, categories, bookingPolicies } = await loadServices(tenant.preview_slug);

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
        />
      </div>
    </div>
  );
}
