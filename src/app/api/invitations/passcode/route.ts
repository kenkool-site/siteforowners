import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/api-rate-limit";
import {
  isSameOrigin,
  setInvitationPasscodeCookie,
} from "@/lib/invitations/auth";
import {
  attemptInvitationPasscode,
} from "@/lib/invitations/passcode";
import { allowInvitationPasscodeAttempt } from "@/lib/invitations/passcode-rate-limit";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-fixtures";

type PasscodeRequest = { slug: string; passcode: string };

function parseRequest(value: unknown): PasscodeRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.slug !== "string"
    || !body.slug
    || body.slug.length > 100
    || typeof body.passcode !== "string"
    || body.passcode.length > 256
  ) return null;
  return { slug: body.slug, passcode: body.passcode };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseRequest(body);
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const invitation = await getPublicInvitationBySlug(input.slug);
    if (!invitation || !invitation.passcodeHash) {
      return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });
    }
    const state = getEffectiveEventState(invitation.event, new Date());
    if (state !== "published" && state !== "rsvp_closed") {
      return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });
    }

    const result = await attemptInvitationPasscode(
      {
        eventId: invitation.event.id,
        passcode: input.passcode,
        storedHash: invitation.passcodeHash,
        ip: getClientIp(request.headers),
      },
      {
        allowAttempt: isInvitationE2EFixturesEnabled() ? async () => true : allowInvitationPasscodeAttempt,
        verifyPasscode: verifyPin,
      },
    );
    if (result === "rate_limited") {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }
    if (result === "invalid") {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    setInvitationPasscodeCookie(response, invitation.event);
    return response;
  } catch (error) {
    console.error("[invitations/passcode] verification failed", { slug: input.slug, error });
    return NextResponse.json({ error: "Unable to verify passcode" }, { status: 500 });
  }
}
