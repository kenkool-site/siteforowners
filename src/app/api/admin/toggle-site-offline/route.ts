import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canToggleSiteOffline } from "@/lib/tenant-access";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

/**
 * Founder-only switch for a DEMO tenant's public site (e.g. take down a demo
 * whose prospect never responded). Flips `tenants.site_published`; the
 * middleware then serves the no-store /not-found rewrite. Refuses non-demo
 * tenants — a paying client's availability is governed by subscription_status
 * and must never be taken down through this path.
 */
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = parsed as { tenant_id?: unknown; site_published?: unknown };

  const tenantId =
    typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  if (typeof body.site_published !== "boolean") {
    return NextResponse.json(
      { error: "site_published must be a boolean" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: tenant, error: lookupError } = await supabase
    .from("tenants")
    .select("is_demo")
    .eq("id", tenantId)
    .maybeSingle();

  if (lookupError) {
    console.error("toggle-site-offline lookup failed:", lookupError);
    return NextResponse.json({ error: "Failed to update site" }, { status: 500 });
  }
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (!canToggleSiteOffline(tenant)) {
    return NextResponse.json(
      {
        error:
          "Only demo sites can be toggled; client sites are governed by subscription status",
      },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("tenants")
    .update({ site_published: body.site_published })
    .eq("id", tenantId);

  if (error) {
    console.error("toggle-site-offline failed:", error);
    return NextResponse.json(
      { error: "Failed to update site" },
      { status: 500 },
    );
  }

  return NextResponse.json({ site_published: body.site_published });
}
