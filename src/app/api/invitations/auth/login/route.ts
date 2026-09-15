import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/api-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOrigin, setOwnerSessionCookie } from "@/lib/invitations/auth";
import {
  attemptInvitationOwnerLogin,
} from "@/lib/invitations/login";
import { invitationLoginRateLimiter } from "@/lib/invitations/login-rate-limit";
import { findFixtureOwnerLogin, isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-fixtures";

type LoginInput = { email: string; pin: string };
type LoginOwnerRow = { id: string; pin_hash: string };

function isLoginInput(value: unknown): value is LoginInput {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.email === "string" && typeof body.pin === "string";
}

function isLoginOwner(value: unknown): value is LoginOwnerRow {
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

  const fixtureMode = isInvitationE2EFixturesEnabled();
  const supabase = fixtureMode ? null : createAdminClient();
  try {
    const result = await attemptInvitationOwnerLogin(
      { email: body.email, pin: body.pin, ip: getClientIp(request.headers) },
      {
        findActiveOwner: async (email) => {
          if (fixtureMode) return findFixtureOwnerLogin(email);
          const { data, error } = await supabase!
            .from("invitation_owners")
            .select("id, pin_hash")
            .eq("email", email)
            .eq("is_active", true)
            .maybeSingle();
          if (error) throw error;
          return isLoginOwner(data) ? { id: data.id, pinHash: data.pin_hash } : null;
        },
        verifyPin,
        rateLimiter: fixtureMode ? { canAttempt: async () => true, recordFailure: async () => true } : invitationLoginRateLimiter,
      },
    );
    if (result.kind === "rate_limited") {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json({ error: "Invalid email or PIN" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    setOwnerSessionCookie(response, result.ownerId);
    return response;
  } catch (error) {
    console.error("[invitations/auth/login] owner lookup failed", { error });
    return NextResponse.json({ error: "Unable to sign in" }, { status: 500 });
  }
}
