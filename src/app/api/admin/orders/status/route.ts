import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new: ["ready", "canceled"],
  ready: ["picked_up", "canceled"],
  picked_up: [],
  canceled: [],
};

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const orderId = typeof b.orderId === "string" ? b.orderId : "";
  const toStatus = typeof b.toStatus === "string" ? b.toStatus : "";

  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (!["new", "ready", "picked_up", "canceled"].includes(toStatus)) {
    return NextResponse.json({ error: "invalid toStatus" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("orders")
    .select("tenant_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentStatus = row.status as string;
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowedNext.includes(toStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${currentStatus} to ${toStatus}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    console.error("[admin/orders/status] update failed", { orderId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
