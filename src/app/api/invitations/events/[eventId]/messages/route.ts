import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import {
  dispatchInvitationBroadcast,
  eligibleBroadcastRecipients,
  getInvitationEmailBroadcastBudget,
  getInvitationSmsBroadcastBudget,
  InvitationBroadcastError,
  listInvitationBroadcasts,
  loadInvitationSmsOptOuts,
  parseComposeBroadcastInput,
  selectBroadcastRecipients,
} from "@/lib/invitations/broadcasts";
import { guestInvitationMail } from "@/lib/invitations/email-from";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [broadcasts, rows, emailBudget, smsBudget] = await Promise.all([
      listInvitationBroadcasts(params.eventId),
      listInvitationResponseRows(params.eventId),
      getInvitationEmailBroadcastBudget(params.eventId),
      getInvitationSmsBroadcastBudget(params.eventId),
    ]);
    const optedOutPhones = await loadInvitationSmsOptOuts(rows.flatMap((row) => row.phone ? [row.phone] : []));
    const smsRecipients = selectBroadcastRecipients({ rows, channel: "sms", optedOutPhones });
    return NextResponse.json({
      broadcasts,
      recipientCounts: {
        email: eligibleBroadcastRecipients(rows, "email").length,
        sms: smsRecipients.ok ? smsRecipients.recipients.length : 0,
      },
      totalResponses: rows.length,
      emailBudget,
      smsBudget,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/messages] list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Messages could not be loaded" }, { status: 500 });
  }
}

const TWILIO_FROM = process.env.TWILIO_FROM || "";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 }); }

  const parsed = parseComposeBroadcastInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.code }, { status: 400 });

  try {
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 404 });

    const guestMail = guestInvitationMail({
      honoreeNames: event.honoreeNames,
      title: event.title,
      hostContactEmail: event.notificationEmail,
      ownerEmail: event.owner.email,
    });
    const result = await dispatchInvitationBroadcast({
      eventId: params.eventId,
      channel: parsed.value.channel,
      subject: parsed.value.subject,
      body: parsed.value.body,
      recipientIds: parsed.value.recipientIds,
      sentBy: actor.kind === "founder" ? "founder" : "owner",
      emailFrom: guestMail.from,
      replyTo: guestMail.replyTo,
      smsFrom: TWILIO_FROM,
      locale: event.locale,
    });
    const emailBudget = parsed.value.channel === "email"
      ? await getInvitationEmailBroadcastBudget(params.eventId, event.emailBroadcastLimit ?? null)
      : null;
    const smsBudget = parsed.value.channel === "sms"
      ? await getInvitationSmsBroadcastBudget(params.eventId, event.smsBroadcastLimit ?? null)
      : null;

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
      emailBudget,
      smsBudget,
    });
  } catch (error) {
    if (error instanceof InvitationBroadcastError) {
      return NextResponse.json({ ok: false, code: error.code }, { status: 400 });
    }
    console.error("[invitations/messages] send failed", { eventId: params.eventId, actor: actor.kind, error });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
