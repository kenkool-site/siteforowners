import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_RE = /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i;

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

function sanitize(raw: unknown): WorkingHours | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: WorkingHours = {};
  for (const day of WEEKDAYS) {
    const v = r[day];
    if (v === null || v === undefined) {
      out[day] = null;
      continue;
    }
    if (typeof v !== "object") return null;
    const d = v as Record<string, unknown>;
    if (typeof d.open !== "string" || typeof d.close !== "string") return null;
    if (!TIME_RE.test(d.open) || !TIME_RE.test(d.close)) return null;
    out[day] = { open: d.open, close: d.close };
  }
  return out;
}

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const hours = sanitize((body as Record<string, unknown>).hours);
  if (!hours) return NextResponse.json({ error: "Invalid hours shape" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("booking_settings")
    .upsert(
      { tenant_id: session.tenant.id, working_hours: hours, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) {
    console.error("[admin/bookings/hours] upsert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
