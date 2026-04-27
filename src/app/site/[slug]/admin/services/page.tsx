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
): Promise<{ services: ServiceItem[]; categories: string[] }> {
  if (!previewSlug) return { services: [], categories: [] };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("services, categories")
    .eq("slug", previewSlug)
    .maybeSingle();
  return {
    services: (data?.services as ServiceItem[] | null) ?? [],
    categories: (data?.categories as string[] | null) ?? [],
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
  const { services, categories } = await loadServices(tenant.preview_slug);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Services</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ServicesClient
          initialServices={services}
          initialCategories={categories}
        />
      </div>
    </div>
  );
}
