import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["confirmed", "completed", "canceled", "no_show"];

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const bookingId = typeof b.bookingId === "string" ? b.bookingId : "";
  const toStatus = typeof b.toStatus === "string" ? b.toStatus : "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }
  if (!ALLOWED.includes(toStatus)) {
    return NextResponse.json({ error: "invalid toStatus" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("bookings")
    .select("tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: toStatus })
    .eq("id", bookingId);
  if (error) {
    console.error("[admin/bookings/status] update failed", { bookingId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
