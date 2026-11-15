import { NextResponse } from "next/server";
import { GuestListError } from "./guest-list-store";

const STATUS: Record<string, number> = {
  not_found: 404,
  feature_disabled: 404,
  invalid_guest: 400,
  invalid_phone: 400,
  invalid_code: 400,
  code_expired: 400,
  duplicate_phone: 409,
  rate_limited: 429,
  sms_not_configured: 409,
  sms_failed: 502,
  rsvp_closed: 409,
  over_seats: 400,
  invalid_party: 400,
  verification_unavailable: 503,
  event_unavailable: 404,
  capacity_reached: 409,
  store_failed: 500,
};

export function guestListErrorResponse(error: unknown, logLabel: string): NextResponse {
  if (error instanceof GuestListError) {
    return NextResponse.json(
      { ok: false, code: error.code, ...(error.errors ? { errors: error.errors } : {}) },
      { status: STATUS[error.code] ?? 400 },
    );
  }
  console.error(logLabel, { error });
  return NextResponse.json({ ok: false, code: "server_error" }, { status: 500 });
}

export async function readTwilioParams(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}
