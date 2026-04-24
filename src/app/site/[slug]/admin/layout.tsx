import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySession, AdminTenant } from "@/lib/admin-auth";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

type TenantRow = AdminTenant & { booking_tool: string | null; checkout_mode: string | null };

async function loadTenantBySlug(slug: string): Promise<TenantRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode"
    )
    .eq("preview_slug", slug)
    .maybeSingle();
  return (data as TenantRow) ?? null;
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

  const sessionCookie = cookies().get("owner_session")?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  const authed = !!session && session.tenant_id === tenant.id;

  if (!authed) {
    return <PinEntry businessName={tenant.business_name} />;
  }

  // Middleware sets x-pathname with the original request path (e.g. "/admin/schedule").
  // We use it to highlight the current nav tab.
  const pathname = headers().get("x-pathname") || "/admin";

  const shellTenant: ShellTenant = {
    business_name: tenant.business_name,
    booking_tool: tenant.booking_tool,
    checkout_mode: tenant.checkout_mode,
  };

  return (
    <AdminShell tenant={shellTenant} currentPath={pathname}>
      {children}
    </AdminShell>
  );
}
