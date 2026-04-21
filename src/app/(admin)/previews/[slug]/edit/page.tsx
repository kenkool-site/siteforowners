import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteEditor } from "../../../clients/[tenantId]/edit/SiteEditor";

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

  return { tenant: tenantData, preview };
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

  return <SiteEditor tenant={data.tenant} preview={data.preview} />;
}
