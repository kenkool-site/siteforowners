import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET: Load booking settings by tenant_id or preview_slug
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenant_id");
  const slug = searchParams.get("slug");

  if (!tenantId && !slug) {
    return NextResponse.json({ error: "tenant_id or slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const query = supabase.from("booking_settings").select("*");

  if (tenantId) query.eq("tenant_id", tenantId);
  else if (slug) query.eq("preview_slug", slug);

  const { data, error } = await query.single();

  if (error || !data) {
    // Return defaults if no settings exist
    return NextResponse.json({
      slot_duration: 60,
      buffer_minutes: 0,
      max_per_slot: 1,
      advance_days: 14,
      working_hours: null,
      blocked_dates: [],
    });
  }

  return NextResponse.json(data);
}

// POST: Save/update booking settings
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tenant_id,
      preview_slug,
      slot_duration,
      buffer_minutes,
      max_per_slot,
      advance_days,
      working_hours,
      blocked_dates,
    } = body;

    if (!tenant_id || !preview_slug) {
      return NextResponse.json({ error: "tenant_id and preview_slug required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Upsert
    const { error } = await supabase
      .from("booking_settings")
      .upsert(
        {
          tenant_id,
          preview_slug,
          slot_duration: slot_duration || 60,
          buffer_minutes: buffer_minutes || 0,
          max_per_slot: max_per_slot || 1,
          advance_days: advance_days || 14,
          working_hours: working_hours || null,
          blocked_dates: blocked_dates || [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

    if (error) {
      console.error("Booking settings save error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Booking settings error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
