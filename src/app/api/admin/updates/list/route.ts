import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = new URL(request.url).searchParams.get("tenantId") || "";
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenantId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("update_requests")
    .select("id, category, description, attachment_url, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[admin/updates/list] fetch failed", { tenantId, error });
    return NextResponse.json({ requests: [] });
  }
  return NextResponse.json({ requests: data ?? [] });
}
