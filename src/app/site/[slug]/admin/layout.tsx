import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/admin-auth";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { loadAdminTheme, adminThemeStyle } from "@/lib/admin-theme";
import { getRollups } from "@/lib/admin-rollups";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

const AUTH_BYPASS_PATHS = ["/admin/forgot-pin", "/admin/pin-reset"];

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
  };

  const rollups = await getRollups(tenant.id);

  return (
    <div style={themeStyle}>
      <AdminShell tenant={shellTenant} unreadCount={rollups.unreadLeads}>{children}</AdminShell>
    </div>
  );
}
