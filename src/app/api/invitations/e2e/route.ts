import { NextRequest, NextResponse } from "next/server";
import {
  attachFixtureInvitationMedia,
  invitationE2EFixtureSnapshot,
  isInvitationE2EFixturesEnabled,
  resetInvitationE2EFixtures,
} from "@/lib/invitations/e2e-fixtures";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  if (!isInvitationE2EFixturesEnabled()) return unavailable();
  try {
    return NextResponse.json(invitationE2EFixtureSnapshot(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Fixtures are not seeded" }, { status: 409 });
  }
}

export async function POST(request: NextRequest) {
  if (!isInvitationE2EFixturesEnabled()) return unavailable();
  const body = await request.json().catch(() => null) as { action?: unknown; eventId?: unknown } | null;
  if (body?.action === "reset") {
    return NextResponse.json(await resetInvitationE2EFixtures(), { headers: { "cache-control": "no-store" } });
  }
  if (body?.action === "attach-media" && typeof body.eventId === "string") {
    try {
      attachFixtureInvitationMedia(body.eventId);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Fixture event not found" }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "Invalid fixture action" }, { status: 400 });
}
