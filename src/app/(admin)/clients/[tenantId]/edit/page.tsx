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

  return { tenant, preview };
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
    />
  );
}
