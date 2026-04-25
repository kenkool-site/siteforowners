import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/admin-auth";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

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
