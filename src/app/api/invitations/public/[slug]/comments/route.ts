import { NextRequest, NextResponse } from "next/server";
import { getClientIp, hashIp } from "@/lib/api-rate-limit";
import {
  getInvitationPasscodeCookieName,
  isSameOrigin,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import {
  canUseInvitationCommentWall,
  decodeCommentCursor,
  invitationCommentContentHash,
  parseInvitationCommentInput,
} from "@/lib/invitations/comments";
import {
  getPublicInvitationBySlug,
  listPublicInvitationComments,
  submitInvitationComment,
} from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

async function authorize(request: NextRequest, slug: string) {
  const invitation = await getPublicInvitationBySlug(slug);
  if (!invitation) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") return null;
  if (invitation.passcodeHash) {
    const signed = request.cookies.get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    try {
      if (!signed || !verifyInvitationPasscodeSession(signed, invitation.event.id)) return null;
    } catch { return null; }
  }
  return invitation;
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const invitation = await authorize(request, params.slug);
    if (!invitation) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 404 });
    if (!canUseInvitationCommentWall(invitation.event)) return NextResponse.json({ ok: false, code: "comment_wall_closed" }, { status: 409 });
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor && !decodeCommentCursor(cursor)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
    const page = await listPublicInvitationComments(invitation.event.id, cursor);
    return NextResponse.json(page, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/comments] public list failed", { slug: params.slug, error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 }); }
  const parsed = parseInvitationCommentInput(payload);
  if (!parsed.ok) return NextResponse.json({ ok: false, code: "invalid_request", errors: parsed.errors }, { status: 400 });
  if (parsed.value.honeypot) return NextResponse.json({ ok: true }, { status: 200 });
  try {
    const invitation = await authorize(request, params.slug);
    if (!invitation) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 404 });
    if (!canUseInvitationCommentWall(invitation.event)) return NextResponse.json({ ok: false, code: "comment_wall_closed" }, { status: 409 });
    const result = await submitInvitationComment({
      eventId: invitation.event.id,
      guestName: parsed.value.guestName,
      body: parsed.value.body,
      ipHash: hashIp(getClientIp(request.headers)),
      contentHash: invitationCommentContentHash(parsed.value),
    });
    if (!result.ok) {
      const status = result.code === "rate_limited" ? 429 : result.code === "comment_wall_closed" ? 409 : 500;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result, { status: result.outcome === "created" ? 201 : 200 });
  } catch (error) {
    console.error("[invitations/comments] public submission failed", { slug: params.slug, error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
