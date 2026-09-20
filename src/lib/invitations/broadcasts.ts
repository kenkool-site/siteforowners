import { escapeHtml } from "@/lib/marketing-lead";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InvitationResponseRow } from "./responses";
import {
  markInvitationNotificationFailed,
  markInvitationNotificationSent,
  reserveInvitationNotification,
  resendEmailSender,
  sanitizeFailureReason,
  saveInvitationNotificationPayload,
  sendPayload,
  twilioSmsSender,
  type NotificationDispatchDependencies,
  type NotificationPayload,
} from "./notifications";
import type { InvitationBroadcast, InvitationNotificationChannel } from "./types";

export type BroadcastRecipient = {
  rsvpId: string;
  primaryName: string;
  contact: string;
};

export function eligibleBroadcastRecipients(
  rows: InvitationResponseRow[],
  channel: InvitationNotificationChannel,
): BroadcastRecipient[] {
  return rows.flatMap((row) => {
    const contact = channel === "email" ? row.email : row.phone;
    return contact ? [{ rsvpId: row.id, primaryName: row.primary_name, contact }] : [];
  });
}

export type ComposeBroadcastInput = {
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
};

export type ComposeBroadcastErrorCode =
  | "invalid_channel"
  | "subject_required"
  | "body_required"
  | "body_too_long";

export type ParseComposeBroadcastResult =
  | { ok: true; value: ComposeBroadcastInput }
  | { ok: false; code: ComposeBroadcastErrorCode };

const MAX_BROADCAST_BODY_LENGTH = 5000;

export function parseComposeBroadcastInput(value: unknown): ParseComposeBroadcastResult {
  if (!value || typeof value !== "object") return { ok: false, code: "body_required" };
  const input = value as Record<string, unknown>;
  const channel = input.channel;
  if (channel !== "email" && channel !== "sms") return { ok: false, code: "invalid_channel" };
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, code: "body_required" };
  if (body.length > MAX_BROADCAST_BODY_LENGTH) return { ok: false, code: "body_too_long" };
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  if (channel === "email" && !subject) return { ok: false, code: "subject_required" };
  return { ok: true, value: { channel, subject: channel === "email" ? subject : null, body } };
}

function renderBroadcastEmailHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`)
    .join("");
  return `<div style="font-family:sans-serif;font-size:15px;color:#2B2231;line-height:1.6;">${paragraphs}</div>`;
}

export type DispatchBroadcastNotificationsInput = {
  eventId: string;
  broadcastId: string;
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
  from: string;
  recipients: BroadcastRecipient[];
};

export type DispatchBroadcastNotificationsResult = {
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

const BROADCAST_BATCH_SIZE = 8;

export async function dispatchBroadcastNotifications(
  input: DispatchBroadcastNotificationsInput,
  dependencies: NotificationDispatchDependencies,
): Promise<DispatchBroadcastNotificationsResult> {
  let sentCount = 0;
  let failedCount = 0;
  let suppressedCount = 0;

  async function sendToRecipient(recipient: BroadcastRecipient): Promise<void> {
    const reservation = await dependencies.reserve(input.channel, {
      eventId: input.eventId,
      rsvpId: recipient.rsvpId,
      audience: "guest",
      recipient: recipient.contact,
      kind: "celebrant_broadcast",
      broadcastId: input.broadcastId,
    });

    if (!reservation.allowed) {
      suppressedCount += 1;
      return;
    }

    const payload: NotificationPayload = input.channel === "email"
      ? {
          channel: "email",
          input: {
            from: input.from,
            to: recipient.contact,
            subject: input.subject ?? "",
            html: renderBroadcastEmailHtml(input.body),
            idempotencyKey: reservation.id,
          },
        }
      : {
          channel: "sms",
          input: {
            from: input.from,
            to: recipient.contact,
            body: input.body,
            idempotencyKey: reservation.id,
          },
        };

    try {
      await dependencies.savePayload(reservation.id, payload);
      const result = await sendPayload(payload, dependencies);
      if (result.ok) {
        sentCount += 1;
        await dependencies.markSent(reservation.id, result.providerId);
      } else {
        failedCount += 1;
        await dependencies.markFailed(reservation.id, sanitizeFailureReason(result.error));
      }
    } catch (error) {
      failedCount += 1;
      await dependencies.markFailed(reservation.id, sanitizeFailureReason(error));
    }
  }

  for (let i = 0; i < input.recipients.length; i += BROADCAST_BATCH_SIZE) {
    const batch = input.recipients.slice(i, i + BROADCAST_BATCH_SIZE);
    await Promise.all(batch.map((recipient) => sendToRecipient(recipient)));
  }

  return { sentCount, failedCount, suppressedCount };
}

function rowToBroadcast(row: Record<string, unknown>): InvitationBroadcast {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    channel: row.channel as InvitationNotificationChannel,
    subject: row.subject as string | null,
    body: row.body as string,
    sentBy: row.sent_by as "owner" | "founder",
    recipientCount: row.recipient_count as number,
    sentCount: row.sent_count as number,
    failedCount: row.failed_count as number,
    suppressedCount: row.suppressed_count as number,
    createdAt: row.created_at as string,
  };
}

export type CreateInvitationBroadcastInput = ComposeBroadcastInput & {
  eventId: string;
  sentBy: "owner" | "founder";
};

export async function createInvitationBroadcast(
  input: CreateInvitationBroadcastInput,
): Promise<InvitationBroadcast> {
  if (!input.body.trim()) throw new Error("Broadcast body is required");
  const { data, error } = await createAdminClient()
    .from("invitation_broadcasts")
    .insert({
      event_id: input.eventId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      sent_by: input.sentBy,
      recipient_count: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Unable to create invitation broadcast", { cause: error });
  return rowToBroadcast(data);
}

async function updateInvitationBroadcastCounts(
  broadcastId: string,
  counts: { recipientCount: number; sentCount: number; failedCount: number; suppressedCount: number },
): Promise<void> {
  const { error } = await createAdminClient()
    .from("invitation_broadcasts")
    .update({
      recipient_count: counts.recipientCount,
      sent_count: counts.sentCount,
      failed_count: counts.failedCount,
      suppressed_count: counts.suppressedCount,
    })
    .eq("id", broadcastId);
  if (error) throw new Error("Unable to update invitation broadcast counts", { cause: error });
}

export async function listInvitationBroadcasts(eventId: string): Promise<InvitationBroadcast[]> {
  const { data, error } = await createAdminClient()
    .from("invitation_broadcasts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load invitation broadcasts", { cause: error });
  return (data ?? []).map(rowToBroadcast);
}

export type SendInvitationBroadcastInput = ComposeBroadcastInput & {
  eventId: string;
  sentBy: "owner" | "founder";
  emailFrom: string;
  smsFrom: string;
};

export type SendInvitationBroadcastResult = {
  broadcast: InvitationBroadcast;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
};

// A local, self-contained query rather than repository.ts's
// listInvitationResponseRows — see the note above the imports at the top of
// this file for why this file never imports from repository.ts. Same
// select shape as repository.ts's listResponseRows.
async function listInvitationRsvpsForBroadcast(eventId: string): Promise<InvitationResponseRow[]> {
  const { data, error } = await createAdminClient()
    .from("invitation_rsvps")
    .select("id,event_id,primary_name,email,phone,attending,party_size,additional_guest_names,dietary_or_accessibility_notes,message,created_at,updated_at")
    .eq("event_id", eventId);
  if (error) throw new Error("Unable to load invitation responses for broadcast", { cause: error });
  return (data ?? []) as InvitationResponseRow[];
}

// savePayload here is the same sealed-payload mechanism RSVP notifications
// use (see dispatchInvitationRsvpNotifications) — it's what lets the
// existing founder "Retry delivery" button and retryInvitationNotification
// work on a failed broadcast send with no new retry code.
/**
 * Real wiring: creates the broadcast row, computes recipients from live RSVP
 * data, dispatches through the real reservation/provider primitives, and
 * persists the final counts. Mirrors dispatchInvitationRsvpNotifications's
 * role for the RSVP-triggered flow.
 */
export async function dispatchInvitationBroadcast(
  input: SendInvitationBroadcastInput,
): Promise<SendInvitationBroadcastResult> {
  const broadcast = await createInvitationBroadcast(input);
  const rows = await listInvitationRsvpsForBroadcast(input.eventId);
  const recipients = eligibleBroadcastRecipients(rows, input.channel);

  const result = await dispatchBroadcastNotifications(
    {
      eventId: input.eventId,
      broadcastId: broadcast.id,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      from: input.channel === "email" ? input.emailFrom : input.smsFrom,
      recipients,
    },
    {
      reserve: reserveInvitationNotification,
      savePayload: saveInvitationNotificationPayload,
      markSent: markInvitationNotificationSent,
      markFailed: markInvitationNotificationFailed,
      email: resendEmailSender,
      sms: twilioSmsSender,
    },
  );

  await updateInvitationBroadcastCounts(broadcast.id, {
    recipientCount: recipients.length,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    suppressedCount: result.suppressedCount,
  });

  return {
    broadcast: {
      ...broadcast,
      recipientCount: recipients.length,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      suppressedCount: result.suppressedCount,
    },
    recipientCount: recipients.length,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    suppressedCount: result.suppressedCount,
  };
}
