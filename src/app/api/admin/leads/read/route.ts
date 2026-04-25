import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const leadId = typeof b.leadId === "string" ? b.leadId : "";
  const isRead = b.isRead === true;
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("contact_leads")
    .select("tenant_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("contact_leads")
    .update({ is_read: isRead })
    .eq("id", leadId);
  if (error) {
    console.error("[admin/leads/read] update failed", { leadId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
