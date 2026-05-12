import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRescheduleUrl, bookingStartToExpiry } from "@/lib/reschedule-token";
import { isValidShortCodeShape } from "@/lib/short-code";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

export const dynamic = "force-dynamic";

/**
 * Customer-facing short reschedule link. Receives `/r/<code>`, looks up
 * the booking by `reschedule_short_code`, mints a fresh signed token from
 * the booking's current date+time, and 302-redirects to the canonical
 * /reschedule URL. The redirect target enforces all auth and quota rules
 * — this route is purely an obscured lookup.
 *
 * The short URL is stable across reschedules: if a booking moves to a
 * new date, the same code still works because we recompute the expiry
 * and signature on every redirect.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code;
  if (!isValidShortCodeShape(code)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, status")
    .eq("reschedule_short_code", code)
    .maybeSingle();

  if (error) {
    console.error("[r/code] lookup failed", { code, error });
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expiry = bookingStartToExpiry(
    booking.booking_date as string,
    booking.booking_time as string,
  );
  const longUrl = buildRescheduleUrl(APP_URL, booking.id as string, expiry);
  return NextResponse.redirect(longUrl, 302);
}
