// src/app/api/memories/events/[eventId]/find-me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { searchFindMe } from "./find-me-search";

export const maxDuration = 60;

const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  try {
    const token = request.cookies.get("memories_guest_session")?.value;
    const session = token ? verifyMemoriesGuestSession(token, params.eventId) : null;
    if (!session?.sessionId) return NextResponse.json({ error: "session required" }, { status: 401 });

    const selfieBytes = new Uint8Array(await request.arrayBuffer());
    if (selfieBytes.length === 0) return NextResponse.json({ error: "no image provided" }, { status: 400 });
    if (selfieBytes.length > MAX_SELFIE_BYTES) return NextResponse.json({ error: "image too large" }, { status: 400 });

    const result = await searchFindMe(params.eventId, session.sessionId, selfieBytes);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[memories/find-me] search failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
