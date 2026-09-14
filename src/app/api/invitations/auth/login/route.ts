import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/api-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOrigin, setOwnerSessionCookie } from "@/lib/invitations/auth";
import { normalizeInvitationEmail } from "@/lib/invitations/validation";

const LOGIN_WINDOW_SECONDS = 60 * 60;
const IP_EMAIL_MAX_ATTEMPTS = 10;
const EMAIL_MAX_ATTEMPTS = 50;
const INVALID_CREDENTIALS = { error: "Invalid email or PIN" };

type LoginInput = { email: string; pin: string };
type LoginOwner = { id: string; pin_hash: string };

function isLoginInput(value: unknown): value is LoginInput {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.email === "string" && typeof body.pin === "string";
}

function isLoginOwner(value: unknown): value is LoginOwner {
  if (!value || typeof value !== "object") return false;
  const owner = value as Record<string, unknown>;
  return typeof owner.id === "string" && typeof owner.pin_hash === "string";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isLoginInput(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = normalizeInvitationEmail(body.email);
  if (!email || !/^\d{4,8}$/.test(body.pin)) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  const ipEmailBucket = `invitation_owner_login:ip_email:${hashIp(`${ip}:${email}`)}`;
  const emailBucket = `invitation_owner_login:email:${hashIp(email)}`;
  const [ipEmailAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(ipEmailBucket, LOGIN_WINDOW_SECONDS, IP_EMAIL_MAX_ATTEMPTS),
    checkRateLimit(emailBucket, LOGIN_WINDOW_SECONDS, EMAIL_MAX_ATTEMPTS),
  ]);
  if (!ipEmailAllowed || !emailAllowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitation_owners")
    .select("id, pin_hash")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[invitations/auth/login] owner lookup failed", { error });
    return NextResponse.json({ error: "Unable to sign in" }, { status: 500 });
  }
  if (!isLoginOwner(data) || !(await verifyPin(body.pin, data.pin_hash))) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setOwnerSessionCookie(response, data.id);
  return response;
}
