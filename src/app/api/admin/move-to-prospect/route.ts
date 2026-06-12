import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildProspectLead } from "@/lib/move-to-prospect";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

/**
 * Move a promoted-preview demo back into the prospect funnel by creating an
 * `interested_leads` row from the tenant. The demo tenant + live site are left
 * untouched — this only makes the business onboard-able from /prospects.
 * Idempotent: a preview that already has a lead is a no-op.
 */
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenant_id } = await request.json();
  if (typeof tenant_id !== "string" || !tenant_id.trim()) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug, business_name, owner_name, phone, email")
    .eq("id", tenant_id)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (!tenant.preview_slug) {
    return NextResponse.json(
      { error: "Tenant has no preview to convert" },
      { status: 409 },
    );
  }

  // Idempotent: don't duplicate a lead the business already has.
  const { data: existing } = await supabase
    .from("interested_leads")
    .select("id")
    .eq("preview_slug", tenant.preview_slug)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  const { error } = await supabase
    .from("interested_leads")
    .insert(buildProspectLead(tenant));

  if (error) {
    console.error("move-to-prospect failed:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
