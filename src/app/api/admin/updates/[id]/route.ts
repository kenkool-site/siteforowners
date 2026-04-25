import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["pending", "in_progress", "done"];

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const status = typeof (body as Record<string, unknown>).status === "string"
    ? ((body as Record<string, unknown>).status as string)
    : "";
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const completed_at = status === "done" ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("update_requests")
    .update({ status, completed_at })
    .eq("id", params.id);
  if (error) {
    console.error("[admin/updates/:id] PATCH failed", { id: params.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
