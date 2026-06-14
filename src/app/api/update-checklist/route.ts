import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isManualItemId } from "@/lib/go-live-checklist";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

interface Body {
  tenant_id?: unknown;
  item_id?: unknown;
  done?: unknown;
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!ADMIN_PASSWORD || sessionCookie !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
  const done = body.done === true;

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  if (!isManualItemId(itemId)) {
    return NextResponse.json({ error: "Invalid item_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant, error: readErr } = await supabase
    .from("tenants")
    .select("go_live_checklist")
    .eq("id", tenantId)
    .maybeSingle();

  if (readErr) {
    console.error("update-checklist lookup failed:", readErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const checklist: Record<string, string> = {
    ...((tenant.go_live_checklist as Record<string, string> | null) ?? {}),
  };
  if (done) {
    checklist[itemId] = new Date().toISOString();
  } else {
    delete checklist[itemId];
  }

  const { error: writeErr } = await supabase
    .from("tenants")
    .update({ go_live_checklist: checklist, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (writeErr) {
    console.error("update-checklist update failed:", writeErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
