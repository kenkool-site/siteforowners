import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  ownerProfileToEditable,
  type EditableOwnerProfile,
} from "@/lib/owner-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadProfile(
  tenant: NonNullable<Awaited<ReturnType<typeof loadTenantBySlug>>>,
): Promise<{ profile: EditableOwnerProfile; warning: string | null }> {
  const fallback = ownerProfileToEditable(
    {
      business_name: tenant.business_name,
      phone: tenant.phone,
      generated_copy: {},
    },
    tenant,
  );

  if (!tenant.preview_slug) {
    return {
      profile: fallback,
      warning: "We could not load your website details. You can still update your profile.",
    };
  }

  try {
    const supabase = createAdminClient();
    const { data: preview, error } = await supabase
      .from("previews")
      .select("business_name, phone, generated_copy")
      .eq("slug", tenant.preview_slug)
      .maybeSingle();

    if (error || !preview) {
      if (error) {
        console.error("[admin/profile/page] preview load failed", {
          tenantId: tenant.id,
          error,
        });
      }
      return {
        profile: fallback,
        warning: "We could not load your website details. You can still update your profile.",
      };
    }

    return {
      profile: ownerProfileToEditable(preview, tenant),
      warning: null,
    };
  } catch (error) {
    console.error("[admin/profile/page] preview load failed", {
      tenantId: tenant.id,
      error,
    });
    return {
      profile: fallback,
      warning: "We could not load your website details. You can still update your profile.",
    };
  }
}

export default async function ProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const { profile, warning } = await loadProfile(tenant);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:px-8 md:py-8">
      <ProfileClient initialProfile={profile} loadWarning={warning} />
    </div>
  );
}
