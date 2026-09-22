import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, verifyEditToken } from "@/lib/invitations/auth";
import { signMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { getRsvpForEditCredential } from "@/lib/invitations/memories/repository";
import type { MemoriesGuestSession } from "@/lib/invitations/memories/types";

const SESSION_LIFETIME_SECONDS = 400 * 24 * 60 * 60; // ~13 months — comfortably covers the 12-month gallery-availability window
const MAX_GUEST_NAME_LENGTH = 80;

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const { eventId } = params;
    const values = body as { rsvpId?: string; editToken?: string; guestName?: string };
    const providedName = values.guestName?.trim().slice(0, MAX_GUEST_NAME_LENGTH) || undefined;

    let session: MemoriesGuestSession;
    if (values.rsvpId && values.editToken) {
      const rsvp = await getRsvpForEditCredential(eventId, values.rsvpId);
      if (rsvp && verifyEditToken(values.editToken, rsvp.editTokenHash)) {
        session = {
          eventId,
          level: "rsvp_guest",
          rsvpId: values.rsvpId,
          guestName: providedName ?? rsvp.primaryName ?? undefined,
          expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        };
      } else {
        session = {
          eventId,
          level: "anonymous",
          guestName: providedName,
          expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        };
      }
    } else {
      session = {
        eventId,
        level: "anonymous",
        guestName: providedName,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
      };
    }

    const token = signMemoriesGuestSession(session);
    const response = NextResponse.json({ level: session.level, guestName: session.guestName ?? null });
    response.cookies.set("memories_guest_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_LIFETIME_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[memories/session] mint failed", { error });
    return NextResponse.json({ error: "session creation failed" }, { status: 500 });
  }
}
