import { escapeHtml } from "@/lib/marketing-lead";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInvitationE2EFixturesEnabled } from "./e2e-guard";
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
  type ReserveNotificationResult,
} from "./notifications";
import { effectiveSmsBroadcastLimit, smsBroadcastRemaining } from "./sms-broadcast-limit";
import type { InvitationBroadcast, InvitationNotificationChannel } from "./types";

export type BroadcastRecipient = {
  rsvpId: string;
  primaryName: string;
  contact: string;
  attending?: boolean;
};

export function eligibleBroadcastRecipients(
  rows: InvitationResponseRow[],
  channel: InvitationNotificationChannel,
): BroadcastRecipient[] {
  return rows.flatMap((row) => {
    const contact = channel === "email" ? row.email : row.phone;
    return contact ? [{ rsvpId: row.id, primaryName: row.primary_name, contact, attending: row.attending }] : [];
  });
}

export function maskInvitationEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

export function maskInvitationPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (last4.length < 4) return "•••";
  return `••• ••• ${last4}`;
}

export type BroadcastRecipientChoice = {
  id: string;
  name: string;
  contact: string;
  status: "attending" | "declined";
};

export function composerRecipientChoices(
  rows: InvitationResponseRow[],
  channel: InvitationNotificationChannel,
): BroadcastRecipientChoice[] {
  return eligibleBroadcastRecipients(rows, channel).map((recipient) => ({
    id: recipient.rsvpId,
    name: recipient.primaryName,
    contact: channel === "email" ? maskInvitationEmail(recipient.contact) : maskInvitationPhone(recipient.contact),
    status: recipient.attending === false ? "declined" : "attending",
  }));
}

export type ComposeBroadcastInput = {
  channel: InvitationNotificationChannel;
  subject: string | null;
  body: string;
  /** Omitted means every guest who can receive this channel. */
  recipientIds?: string[];
};

export type ComposeBroadcastErrorCode =
  | "invalid_channel"
  | "subject_required"
  | "body_required"
  | "body_too_long"
  | "invalid_recipients";

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
  let recipientIds: string[] | undefined;
  if ("recipientIds" in input && input.recipientIds !== undefined) {
    const raw = input.recipientIds;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2000) {
      return { ok: false, code: "invalid_recipients" };
    }
    const ids: string[] = [];
    for (const id of raw) {
      if (typeof id !== "string") return { ok: false, code: "invalid_recipients" };
      const trimmed = id.trim();
      if (!trimmed || trimmed.length > 80) return { ok: false, code: "invalid_recipients" };
      ids.push(trimmed);
    }
    recipientIds = ids;
  }
  return { ok: true, value: { channel, subject: channel === "email" ? subject : null, body, recipientIds } };
}

export class InvitationBroadcastError extends Error {
  constructor(readonly code: "invalid_recipients") {
    super(code);
    this.name = "InvitationBroadcastError";
  }
}

/** Every explicit id must belong to this event and be eligible for the channel. */
export function resolveBroadcastRecipients(
  eligible: readonly BroadcastRecipient[],
  recipientIds: readonly string[] | undefined,
): { ok: true; recipients: BroadcastRecipient[] } | { ok: false; code: "invalid_recipients" } {
  if (!recipientIds) return { ok: true, recipients: [...eligible] };
  if (recipientIds.length === 0) return { ok: false, code: "invalid_recipients" };
  const byId = new Map(eligible.map((recipient) => [recipient.rsvpId, recipient]));
  const seen = new Set<string>();
  const recipients: BroadcastRecipient[] = [];
  for (const id of recipientIds) {
    if (seen.has(id)) return { ok: false, code: "invalid_recipients" };
    const match = byId.get(id);
    if (!match) return { ok: false, code: "invalid_recipients" };
    seen.add(id);
    recipients.push(match);
  }
  return { ok: true, recipients };
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

  // Swallows any throw from markFailed. Without this, a markFailed call
  // that itself throws (e.g. the same kind of Supabase/RPC error reserve()
  // can throw) would escape whichever try/catch invoked it uncaught — see
  // the longer note in sendToRecipient below for why an uncaught throw
  // anywhere in that function takes down its whole Promise.all batch, not
  // just this one recipient. There is nothing further to do if the DB
  // write recording "failed" itself fails: the recipient is already
  // counted as failed by the caller regardless.
  async function safeMarkFailed(notificationId: string, reason: string): Promise<void> {
    try {
      await dependencies.markFailed(notificationId, reason);
    } catch {
      // Intentionally swallowed — see comment above.
    }
  }

  async function sendToRecipient(recipient: BroadcastRecipient): Promise<void> {
    let reservation: ReserveNotificationResult;
    try {
      reservation = await dependencies.reserve(input.channel, {
        eventId: input.eventId,
        rsvpId: recipient.rsvpId,
        audience: "guest",
        recipient: recipient.contact,
        kind: "celebrant_broadcast",
        broadcastId: input.broadcastId,
      });
    } catch {
      // reserveInvitationNotification throws on any Supabase/RPC error (see
      // notifications.ts). This must be caught here, not left to propagate:
      // sendToRecipient runs inside Promise.all for a whole batch, so an
      // uncaught throw here would reject every sibling in the batch too —
      // not "abort the batch" cleanly, but leave already-in-flight siblings
      // running detached in the background with their outcomes silently
      // lost, and any later batches never attempted at all. There is no
      // notification row to mark failed (the reservation itself never
      // succeeded), so this recipient simply counts as failed.
      failedCount += 1;
      return;
    }

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

    // From here on, every exit must resolve to exactly one outcome (sent or
    // failed) and must never throw back into Promise.all — the same
    // batch-isolation reasoning as the reserve() catch above, one level
    // deeper: this function runs inside Promise.all for a whole batch, so
    // an uncaught throw anywhere past this point would reject every
    // sibling in the batch (their sends may already be in flight and would
    // complete with their outcomes silently lost) and abort every later
    // batch entirely. This single try/catch is a safety net around the
    // specific success/failure-result handling below, not a replacement
    // for it — it exists for when savePayload, sendPayload, or either mark
    // call throws instead of resolving normally.
    try {
      await dependencies.savePayload(reservation.id, payload);
      const result = await sendPayload(payload, dependencies);
      if (result.ok) {
        // Only counted as sent once markSent has actually persisted that
        // status. Incrementing sentCount first (before this await) meant a
        // markSent throw fell through to the catch below and ALSO
        // incremented failedCount — double-counting this recipient and
        // mislabeling a delivered message as failed in the database, which
        // could then surface in the founder's retry UI and risk a
        // duplicate send to a guest who already received it.
        await dependencies.markSent(reservation.id, result.providerId);
        sentCount += 1;
      } else {
        failedCount += 1;
        await safeMarkFailed(reservation.id, sanitizeFailureReason(result.error));
      }
    } catch (error) {
      failedCount += 1;
      await safeMarkFailed(reservation.id, sanitizeFailureReason(error));
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
  if (isInvitationE2EFixturesEnabled()) {
    const { fixtureCreateBroadcast } = await import("./e2e-fixtures");
    return fixtureCreateBroadcast({
      eventId: input.eventId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      sentBy: input.sentBy,
    });
  }
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
  if (isInvitationE2EFixturesEnabled()) {
    const { fixtureUpdateBroadcastCounts } = await import("./e2e-fixtures");
    return fixtureUpdateBroadcastCounts(broadcastId, counts);
  }
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

export type InvitationSmsBroadcastBudget = {
  limit: number;
  remaining: number;
};

async function countCelebrantBroadcastSms(eventId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("invitation_notifications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("channel", "sms")
    .eq("kind", "celebrant_broadcast")
    .in("status", ["pending", "sent", "failed"]);
  if (error) throw new Error("Unable to count guest text messages", { cause: error });
  return count ?? 0;
}

async function readSmsBroadcastOverride(eventId: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("invitation_events")
    .select("sms_broadcast_limit")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error("Unable to load guest text limit", { cause: error });
  const value = data?.sms_broadcast_limit;
  return typeof value === "number" ? value : null;
}

/**
 * Remaining guest-broadcast texts for the composer. Returns null when the
 * count cannot be loaded so the composer still opens. Host RSVP alerts are
 * not included in `remaining`.
 */
export async function getInvitationSmsBroadcastBudget(
  eventId: string,
  knownOverride?: number | null,
): Promise<InvitationSmsBroadcastBudget | null> {
  try {
    const override = knownOverride === undefined ? await readSmsBroadcastOverride(eventId) : knownOverride;
    const limit = effectiveSmsBroadcastLimit(override);
    if (isInvitationE2EFixturesEnabled()) return { limit, remaining: limit };
    const used = await countCelebrantBroadcastSms(eventId);
    return { limit, remaining: smsBroadcastRemaining(limit, used) };
  } catch (error) {
    console.error("[invitations/messages] sms budget unavailable", { eventId, error });
    return null;
  }
}

export async function listInvitationBroadcasts(eventId: string): Promise<InvitationBroadcast[]> {
  if (isInvitationE2EFixturesEnabled()) {
    const { fixtureListBroadcasts } = await import("./e2e-fixtures");
    return fixtureListBroadcasts(eventId);
  }
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
  if (isInvitationE2EFixturesEnabled()) {
    const { invitationE2ERepository } = await import("./e2e-fixtures");
    return invitationE2ERepository.listResponseRows(eventId);
  }
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
  const rows = await listInvitationRsvpsForBroadcast(input.eventId);
  const selected = resolveBroadcastRecipients(
    eligibleBroadcastRecipients(rows, input.channel),
    input.recipientIds,
  );
  if (!selected.ok) throw new InvitationBroadcastError(selected.code);
  const recipients = selected.recipients;
  const broadcast = await createInvitationBroadcast(input);

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
