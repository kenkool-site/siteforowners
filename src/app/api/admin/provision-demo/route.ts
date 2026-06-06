import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionTenantFromPreview } from "@/lib/provision-tenant";
import { canTeardownDemo } from "@/lib/tenant-access";
import { generateSubdomain, pickAvailableSubdomain } from "@/lib/subdomain";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

// Provision a preview into a real, subdomain-backed demo tenant.
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preview_slug, subdomain: requestedSubdomain } = await request.json();
  if (typeof preview_slug !== "string" || !preview_slug.trim()) {
    return NextResponse.json({ error: "preview_slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name")
    .eq("slug", preview_slug)
    .maybeSingle();
  if (!preview) {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }

  // Never overwrite a real paying client. If a tenant already exists for this
  // preview and it is not a demo, refuse.
  const { data: existingTenant } = await supabase
    .from("tenants")
    .select("id, is_demo")
    .eq("preview_slug", preview_slug)
    .maybeSingle();
  if (existingTenant && existingTenant.is_demo !== true) {
    return NextResponse.json(
      { error: "This preview is already a live client" },
      { status: 409 },
    );
  }

  try {
    // Resolve a free subdomain. Honor a founder-supplied one (slugified); else
    // derive from the business name. Dedupe against existing tenants.
    const base =
      typeof requestedSubdomain === "string" && requestedSubdomain.trim()
        ? generateSubdomain(requestedSubdomain)
        : generateSubdomain(preview.business_name || preview.slug);

    const { data: clashes } = await supabase
      .from("tenants")
      .select("subdomain, preview_slug")
      .like("subdomain", `${base}%`);
    // A subdomain already owned by THIS preview's tenant is not a clash.
    const taken = new Set(
      (clashes || [])
        .filter((c) => c.preview_slug !== preview_slug && typeof c.subdomain === "string")
        .map((c) => c.subdomain as string),
    );
    const subdomain = pickAvailableSubdomain(base, (c) => taken.has(c));

    const { tenantId } = await provisionTenantFromPreview(supabase, {
      previewSlug: preview_slug,
      status: "trialing",
      isDemo: true,
      subdomain,
      sitePublished: true,
    });
    return NextResponse.json({
      tenantId,
      subdomain,
      url: `https://${subdomain}.siteforowners.com`,
    });
  } catch (e) {
    console.error("provision-demo failed:", e);
    return NextResponse.json({ error: "Provisioning failed" }, { status: 500 });
  }
}

// Tear a demo back down to a plain preview. Refuses to touch a paying tenant.
export async function DELETE(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preview_slug } = await request.json();
  if (typeof preview_slug !== "string" || !preview_slug.trim()) {
    return NextResponse.json({ error: "preview_slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, is_demo")
    .eq("preview_slug", preview_slug)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "No tenant for this preview" }, { status: 404 });
  }
  if (!canTeardownDemo(tenant as { is_demo?: boolean | null })) {
    return NextResponse.json(
      { error: "Refusing to delete a paying client" },
      { status: 409 },
    );
  }

  const tenantId = tenant.id as string;
  // Clear child rows that do NOT cascade on tenant delete:
  // demo bookings are throwaway → delete; leads stay in the funnel → detach.
  await supabase.from("bookings").delete().eq("tenant_id", tenantId);
  await supabase.from("interested_leads").update({ tenant_id: null }).eq("tenant_id", tenantId);
  // booking_settings, orders, and owner-admin tables cascade automatically.
  const { error } = await supabase.from("tenants").delete().eq("id", tenantId);
  if (error) {
    console.error("revert-to-preview failed:", error);
    return NextResponse.json({ error: "Teardown failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
