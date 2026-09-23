import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { signMemoriesGuestSession, verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { getRsvpForEditCredential } from "@/lib/invitations/memories/repository";
import { resolveMemoriesGuestSession, SESSION_LIFETIME_SECONDS } from "./resolve-guest-session";

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
    const providedCredential = values.rsvpId && values.editToken
      ? { rsvpId: values.rsvpId, editToken: values.editToken }
      : null;
    const rsvpRow = providedCredential
      ? await getRsvpForEditCredential(eventId, providedCredential.rsvpId)
      : null;

    const existingToken = request.cookies.get("memories_guest_session")?.value;
    const existingSession = existingToken ? verifyMemoriesGuestSession(existingToken, eventId) : null;
    const session = resolveMemoriesGuestSession(
      eventId,
      rsvpRow,
      providedCredential,
      providedName,
      undefined,
      existingSession?.sessionId ?? randomUUID(),
    );

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
