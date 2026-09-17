import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { isInvitationCommentId } from "@/lib/invitations/comments";
import {
  getInvitationEventForManagement,
  listInvitationCommentsForManagement,
  markInvitationGuestbookReviewed,
  removeInvitationComment,
  setInvitationCommentHidden,
  setInvitationCommentWallEnabled,
} from "@/lib/invitations/repository";

async function access(request: NextRequest, eventId: string) {
  return requireInvitationAccess(request, eventId);
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!await access(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [event, comments] = await Promise.all([getInvitationEventForManagement(params.eventId), listInvitationCommentsForManagement(params.eventId)]);
    if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    return NextResponse.json({ enabled: event.commentWallEnabled, comments }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/comments] management list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Guestbook could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const values = body as Record<string, unknown>;
  try {
    if (values.action === "set_enabled" && typeof values.enabled === "boolean") {
      await setInvitationCommentWallEnabled(params.eventId, values.enabled);
    } else if (values.action === "mark_reviewed") {
      await markInvitationGuestbookReviewed(params.eventId);
    } else if (values.action === "set_hidden" && isInvitationCommentId(values.commentId) && typeof values.hidden === "boolean") {
      const changed = await setInvitationCommentHidden(params.eventId, values.commentId, values.hidden);
      if (!changed) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    } else return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.info("[invitations/comments] management update", { eventId: params.eventId, action: values.action, actor: actor.kind });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[invitations/comments] management update failed", { eventId: params.eventId, action: values.action, actor: actor.kind, error });
    return NextResponse.json({ error: "Guestbook could not be updated" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const values = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (!isInvitationCommentId(values.commentId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const removed = await removeInvitationComment(params.eventId, values.commentId);
    if (!removed) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    console.info("[invitations/comments] comment removed", { eventId: params.eventId, commentId: values.commentId, actor: actor.kind });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[invitations/comments] removal failed", { eventId: params.eventId, commentId: values.commentId, actor: actor.kind, error });
    return NextResponse.json({ error: "Comment could not be removed" }, { status: 500 });
  }
}
