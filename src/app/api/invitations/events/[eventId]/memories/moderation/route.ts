import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { requestHighlightGeneration } from "@/lib/invitations/memories/highlight-service";
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

    // Approving an awaiting-review/flagged item makes its already-stored AI
    // Highlight descriptor (persisted back when /api/memories/moderate first
    // classified it) eligible for grouping — opportunistically queue a
    // generation so the event's highlights catch up. Best-effort: a queueing
    // hiccup here must never turn an otherwise-successful moderation action
    // into a failure response. Rejection/removal must never queue a
    // generation, so this only ever runs for "approve".
    if (body.action === "approve" && updatedIds.length > 0) {
      try {
        await requestHighlightGeneration(params.eventId, false);
      } catch (err) {
        console.error("[memories/moderation] failed to queue highlight generation (non-fatal)", { eventId: params.eventId, error: err });
      }
    }

    if (updatedIds.length !== body.mediaIds.length) return NextResponse.json({ error: "One or more photos are no longer eligible for this action", updatedIds }, { status: 409 });
    return NextResponse.json({ ok: true, updatedIds });
  } catch (error) {
    console.error("[memories/moderation] update failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "moderation update failed" }, { status: 500 });
  }
}
