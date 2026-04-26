import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const mode = b.mode === "remove" ? "remove" : "add";
  const dates = Array.isArray(b.dates)
    ? (b.dates.filter((d) => typeof d === "string" && ISO_DATE_RE.test(d)) as string[])
    : [];
  if (dates.length === 0) {
    return NextResponse.json({ error: "dates required (YYYY-MM-DD)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // booking_settings.preview_slug is NOT NULL. Required when this is the
  // tenant's first booking_settings row (e.g. they've never edited hours).
  const previewSlug = session.tenant.preview_slug;
  if (!previewSlug) {
    console.error("[admin/bookings/block-date] tenant has no preview_slug", { tenantId: session.tenant.id });
    return NextResponse.json({ error: "Tenant misconfigured (no preview_slug)" }, { status: 500 });
  }

  const { data: row } = await supabase
    .from("booking_settings")
    .select("blocked_dates")
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  const existing = new Set(((row?.blocked_dates as string[] | null) ?? []));
  if (mode === "add") dates.forEach((d) => existing.add(d));
  else dates.forEach((d) => existing.delete(d));
  const next = Array.from(existing).sort();

  const { error } = await supabase
    .from("booking_settings")
    .upsert(
      {
        tenant_id: session.tenant.id,
        preview_slug: previewSlug,
        blocked_dates: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );
  if (error) {
    console.error("[admin/bookings/block-date] upsert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, blocked_dates: next });
}
