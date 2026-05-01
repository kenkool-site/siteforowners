import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminTheme, adminThemeStyle } from "@/lib/admin-theme";
import { buildMockAdminData } from "@/lib/preview-admin-mock";
import { PreviewAdminShell } from "./_components/PreviewAdminShell";

export const dynamic = "force-dynamic";

export default async function PreviewAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const supabase = createAdminClient();
  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name, business_type, services")
    .eq("slug", params.slug)
    .single();

  if (!preview) notFound();

  // Linked tenant (if any) is the canonical source for checkout_mode.
  // Preview-only sites don't expose this in the editor, so default mockup.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("checkout_mode")
    .eq("preview_slug", preview.slug as string)
    .maybeSingle();
  const checkoutMode = (tenant?.checkout_mode as string | null) ?? null;

  const theme = await loadAdminTheme(preview.slug as string).catch(() =>
    loadAdminTheme(null),
  );
  const themeStyle = adminThemeStyle(theme);

  const mock = buildMockAdminData({
    slug: preview.slug as string,
    business_name: preview.business_name as string | null,
    business_type: preview.business_type as string | null,
    services: (preview.services as Array<{ name: string; price?: string; durationMinutes?: number }> | null) || [],
    checkout_mode: checkoutMode,
  });

  const pathPrefix = `/preview/${preview.slug}/admin`;
  const backHref = `/preview/${preview.slug}`;

  return (
    <div style={themeStyle}>
      {/* Demo banner — pinned across all admin sub-pages. */}
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs flex items-center justify-between gap-3">
        <span>
          <span className="font-semibold">Demo preview</span>
          <span className="hidden sm:inline"> · sample data, no real bookings or leads</span>
        </span>
        <Link href={backHref} className="font-semibold hover:underline whitespace-nowrap">
          ← Back to your site
        </Link>
      </div>
      <PreviewAdminShell
        tenant={{
          business_name: (preview.business_name as string) || "Your Business",
          checkout_mode: checkoutMode,
        }}
        pathPrefix={pathPrefix}
        backHref={backHref}
        unreadCount={mock.rollups.unreadLeads}
      >
        {children}
      </PreviewAdminShell>
    </div>
  );
}
