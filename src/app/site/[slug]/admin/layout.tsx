import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/admin-auth";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { loadAdminTheme, adminThemeStyle } from "@/lib/admin-theme";
import { getRollups } from "@/lib/admin-rollups";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShellTenant } from "@/lib/admin-navigation";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

const AUTH_BYPASS_PATHS = ["/admin/forgot-pin", "/admin/pin-reset"];

async function loadProfileImageUrl(previewSlug: string | null): Promise<string | null> {
  if (!previewSlug) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("generated_copy")
    .eq("slug", previewSlug)
    .maybeSingle();
  if (error) {
    console.error("[admin/layout] profile image load failed", {
      previewSlug,
      error,
    });
    return null;
  }
  const copy =
    data?.generated_copy &&
    typeof data.generated_copy === "object" &&
    !Array.isArray(data.generated_copy)
      ? (data.generated_copy as Record<string, unknown>)
      : {};
  const settings =
    copy.section_settings &&
    typeof copy.section_settings === "object" &&
    !Array.isArray(copy.section_settings)
      ? (copy.section_settings as Record<string, unknown>)
      : {};
  return typeof settings.about_image_url === "string"
    ? settings.about_image_url
    : null;
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const theme = await loadAdminTheme(tenant.preview_slug);
  const themeStyle = adminThemeStyle(theme);

  const pathname = headers().get("x-pathname") || "";
  if (AUTH_BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // Pre-auth pages render bare (no shell, no PinEntry interception).
    return (
      <div className="min-h-screen bg-gray-50" style={themeStyle}>
        {children}
      </div>
    );
  }

  const sessionCookie = cookies().get("owner_session")?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  const authed = !!session && session.tenant_id === tenant.id;

  if (!authed) {
    return (
      <div style={themeStyle}>
        <PinEntry businessName={tenant.business_name} />
      </div>
    );
  }

  const shellTenant: ShellTenant = {
    business_name: tenant.business_name,
    booking_tool: tenant.booking_tool,
    checkout_mode: tenant.checkout_mode,
    profile_image_url: await loadProfileImageUrl(tenant.preview_slug),
  };

  const rollups = await getRollups(tenant.id);

  return (
    <div style={themeStyle}>
      <AdminShell tenant={shellTenant} unreadCount={rollups.unreadLeads}>{children}</AdminShell>
    </div>
  );
}
