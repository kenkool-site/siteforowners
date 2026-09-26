// src/app/api/memories/events/[eventId]/find-me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { searchFindMe } from "./find-me-search";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const token = request.cookies.get("memories_guest_session")?.value;
  const session = token ? verifyMemoriesGuestSession(token, params.eventId) : null;
  if (!session?.sessionId) return NextResponse.json({ error: "session required" }, { status: 401 });

  const selfieBytes = new Uint8Array(await request.arrayBuffer());
  if (selfieBytes.length === 0) return NextResponse.json({ error: "no image provided" }, { status: 400 });

  const result = await searchFindMe(params.eventId, session.sessionId, selfieBytes);
  return NextResponse.json(result.body, { status: result.status });
}
