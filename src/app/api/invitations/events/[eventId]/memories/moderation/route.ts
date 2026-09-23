import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { moderateMemoryMediaForHost } from "@/lib/invitations/memories/repository";
import type { HostModerationAction } from "@/lib/invitations/memories/host";

const ACTIONS = new Set<HostModerationAction>(["approve", "reject", "remove"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { action?: HostModerationAction; mediaIds?: unknown };
    if (!body.action || !ACTIONS.has(body.action) || !Array.isArray(body.mediaIds) || body.mediaIds.length < 1 || body.mediaIds.length > 100 || !body.mediaIds.every((id) => typeof id === "string" && UUID.test(id))) {
      return NextResponse.json({ error: "invalid action or mediaIds" }, { status: 400 });
    }
    const updatedIds = await moderateMemoryMediaForHost(params.eventId, body.action, body.mediaIds as string[]);
    if (updatedIds.length !== body.mediaIds.length) return NextResponse.json({ error: "One or more photos are no longer eligible for this action", updatedIds }, { status: 409 });
    return NextResponse.json({ ok: true, updatedIds });
  } catch (error) {
    console.error("[memories/moderation] update failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "moderation update failed" }, { status: 500 });
  }
}
