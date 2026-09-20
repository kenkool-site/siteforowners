import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import {
  dispatchInvitationBroadcast,
  eligibleBroadcastRecipients,
  listInvitationBroadcasts,
  parseComposeBroadcastInput,
} from "@/lib/invitations/broadcasts";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

async function access(request: NextRequest, eventId: string) {
  return requireInvitationAccess(request, eventId);
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [broadcasts, rows] = await Promise.all([
      listInvitationBroadcasts(params.eventId),
      listInvitationResponseRows(params.eventId),
    ]);
    return NextResponse.json({
      broadcasts,
      recipientCounts: {
        email: eligibleBroadcastRecipients(rows, "email").length,
        sms: eligibleBroadcastRecipients(rows, "sms").length,
      },
      totalResponses: rows.length,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/messages] list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Messages could not be loaded" }, { status: 500 });
  }
}

const EMAIL_FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";
const TWILIO_FROM = process.env.TWILIO_FROM || "";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const actor = await access(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 }); }

  const parsed = parseComposeBroadcastInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });

  try {
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 404 });

    const result = await dispatchInvitationBroadcast({
      eventId: params.eventId,
      channel: parsed.value.channel,
      subject: parsed.value.subject,
      body: parsed.value.body,
      sentBy: actor.kind === "founder" ? "founder" : "owner",
      emailFrom: EMAIL_FROM,
      smsFrom: TWILIO_FROM,
    });

    console.info("[invitations/messages] broadcast sent", {
      eventId: params.eventId, actor: actor.kind, channel: parsed.value.channel,
      recipientCount: result.recipientCount, sentCount: result.sentCount,
      failedCount: result.failedCount, suppressedCount: result.suppressedCount,
    });

    return NextResponse.json({
      ok: true,
      broadcast: result.broadcast,
      recipientCount: result.recipientCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      suppressedCount: result.suppressedCount,
    });
  } catch (error) {
    console.error("[invitations/messages] send failed", { eventId: params.eventId, actor: actor.kind, error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
