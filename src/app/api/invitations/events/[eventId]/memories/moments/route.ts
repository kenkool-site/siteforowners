import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { createMemoryMoment, listMemoryMoments } from "@/lib/invitations/memories/repository";

const MAX_NAME_LENGTH = 80;

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const moments = await listMemoryMoments(params.eventId);
    return NextResponse.json({ moments });
  } catch (error) {
    console.error("[memories/moments] list failed", { error });
    return NextResponse.json({ error: "failed to list moments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const values = body as { name?: string; startsAt?: string; endsAt?: string; sortOrder?: number };
    const name = values.name?.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const startsAtMs = values.startsAt ? Date.parse(values.startsAt) : NaN;
    const endsAtMs = values.endsAt ? Date.parse(values.endsAt) : NaN;
    if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
      return NextResponse.json({ error: "startsAt and endsAt must be valid dates" }, { status: 400 });
    }
    if (endsAtMs <= startsAtMs) {
      return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
    }

    const moment = await createMemoryMoment(params.eventId, {
      name,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      sortOrder: typeof values.sortOrder === "number" ? values.sortOrder : undefined,
    });
    return NextResponse.json({ moment });
  } catch (error) {
    console.error("[memories/moments] create failed", { error });
    return NextResponse.json({ error: "failed to create moment" }, { status: 500 });
  }
}
