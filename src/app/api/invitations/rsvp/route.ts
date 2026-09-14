import { NextRequest, NextResponse } from "next/server";
import { getClientIp, hashIp } from "@/lib/api-rate-limit";
import {
  getInvitationPasscodeCookieName,
  isSameOrigin,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import {
  allowInvitationRsvpAttempt,
  processPublicRsvpRequest,
  submitInvitationRsvp,
} from "@/lib/invitations/rsvp";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await processPublicRsvpRequest({
      body,
      ipHash: hashIp(getClientIp(request.headers)),
      readPasscodeCookie: (eventId) => request.cookies.get(getInvitationPasscodeCookieName(eventId))?.value ?? null,
      origin: request.nextUrl.origin,
      now: new Date(),
    }, {
      // Exact lookup is intentional: invitation slugs are case-sensitive credentials.
      findInvitation: getPublicInvitationBySlug,
      verifyPasscode: (signed, eventId) => {
        try {
          return verifyInvitationPasscodeSession(signed, eventId);
        } catch {
          return false;
        }
      },
      allowAttempt: allowInvitationRsvpAttempt,
      submit: submitInvitationRsvp,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // Keep edit tokens and full guest contacts out of logs.
    console.error("[invitations/rsvp] submission failed", { error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
