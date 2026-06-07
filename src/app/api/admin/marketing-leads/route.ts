import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["new", "contacted", "archived"]);

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

// Update a marketing lead's status and/or link a generated preview group to it.
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (typeof body.preview_group_id === "string" && body.preview_group_id.trim()) {
    updates.preview_group_id = body.preview_group_id.trim();
    // Building a preview implies the lead has been actioned.
    if (!updates.status) updates.status = "contacted";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("marketing_leads")
    .update(updates)
    .eq("id", leadId);
  if (error) {
    console.error("[admin/marketing-leads] update failed", { leadId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
