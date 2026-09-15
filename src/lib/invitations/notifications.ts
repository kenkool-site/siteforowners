// Capped email/SMS delivery for invitation RSVPs. Two pure, dependency-injected
// entry points mirror the split already established in rsvp.ts
// (submitRsvp/submitInvitationRsvp): a pure policy function that is unit
// tested with fake providers, and a "real" wired convenience that the route
// handlers call directly.
//
//   dispatchRsvpNotifications(...)              — pure, tested directly
//   dispatchInvitationRsvpNotifications(...)     — wired: real DB + providers
//
//   processInvitationNotificationRetry(...)      — pure, tested directly
//   retryInvitationNotification(...)             — wired: real DB + providers
//
// Provider failure (or even a bug in the dispatch/retry wiring itself) must
// never turn a successful RSVP into an error response for the guest — see
// dispatchInvitationRsvpNotifications's outer try/catch.

import { sealNotificationPayload, openNotificationPayload } from "./notification-payload";
import { Resend } from "resend";
import twilio from "twilio";
import { escapeHtml } from "@/lib/marketing-lead";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitationPublicUrl } from "./public-url";
import type {
  InvitationLocale,
  InvitationNotificationAudience,
  InvitationNotificationChannel,
  InvitationNotificationKind,
  RsvpMutationResult,
} from "./types";

// notifications.ts is a plain server-side module with no React tree, so the
// app's usual next-intl/useTranslations path (see e.g.
// InvitationPublicProvider) doesn't apply here. The bilingual strings for
// this feature still live in messages/en.json / messages/es.json per the
// project's global bilingual-content rule; this file just does a plain
// object lookup on invitation_events.locale instead of a React hook.
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

type NotificationStrings = typeof en.invitations.notifications;

function notificationStrings(locale: InvitationLocale): NotificationStrings {
  return locale === "es" ? es.invitations.notifications : en.invitations.notifications;
}

// Minimal {token} substitution — this module has no ICU/next-intl formatter
// available, and every placeholder here is a single plain value (a count,
// a name, an event title), so a full message-format library is unneeded.
function format(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(value),
    template,
  );
}

// ---------------------------------------------------------------------------
// Provider-neutral sender interface
// ---------------------------------------------------------------------------

export type NotificationSendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

export interface NotificationSender<TInput> {
  send(input: TInput): Promise<NotificationSendResult>;
}

export type EmailSendInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export type SmsSendInput = {
  from: string;
  to: string;
  body: string;
  idempotencyKey: string;
};

export type EmailSender = NotificationSender<EmailSendInput>;
export type SmsSender = NotificationSender<SmsSendInput>;

function sanitizeFailureReason(error: unknown): string {
  void error;
  // Provider errors can echo recipients, authored content or capability links.
  return "Notification delivery failed";
}
export type NotificationPayload =
  | { channel: "email"; input: EmailSendInput }
  | { channel: "sms"; input: SmsSendInput };

function validPayload(value: unknown): value is NotificationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!payload.input || typeof payload.input !== "object") return false;
  const input = payload.input as Record<string, unknown>;
  return typeof input.from === "string" && typeof input.to === "string" && typeof input.idempotencyKey === "string"
    && (payload.channel === "email" ? typeof input.subject === "string" && typeof input.html === "string"
      : payload.channel === "sms" && typeof input.body === "string");
}

async function sendPayload(payload: NotificationPayload, dependencies: { email: EmailSender; sms: SmsSender }): Promise<NotificationSendResult> {
  return payload.channel === "email" ? dependencies.email.send(payload.input) : dependencies.sms.send(payload.input);
}

// ---------------------------------------------------------------------------
// Content builders — every authored field is escaped for the HTML email.
// ---------------------------------------------------------------------------

type NotificationRsvpFields = {
  primaryName: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  partySize: number;
  dietaryOrAccessibilityNotes: string | null;
  message: string | null;
};

function ownerLabel(locale: InvitationLocale, created: boolean, attending: boolean): string {
  const T = notificationStrings(locale);
  const verb = created ? T.ownerLabel.new : T.ownerLabel.updated;
  return attending ? verb : `${verb}${T.ownerLabel.declinedSuffix}`;
}

function ownerEmailSubject(input: {
  eventTitle: string;
  created: boolean;
  rsvp: NotificationRsvpFields;
  locale: InvitationLocale;
}): string {
  return `${ownerLabel(input.locale, input.created, input.rsvp.attending)} — ${input.eventTitle}`;
}

function renderOwnerEmailHtml(input: {
  eventTitle: string;
  created: boolean;
  rsvp: NotificationRsvpFields;
  dashboardUrl: string;
  locale: InvitationLocale;
}): string {
  const { rsvp, locale } = input;
  const T = notificationStrings(locale);
  const contact = rsvp.email || rsvp.phone || T.owner.noContactProvided;
  const partyStatus = rsvp.attending
    ? format(T.owner.partyOf, { count: String(rsvp.partySize) })
    : T.owner.notAttending;
  const notesLine = rsvp.dietaryOrAccessibilityNotes
    ? `<p style="margin:0 0 8px;"><strong>${escapeHtml(T.owner.notesLabel)}</strong> ${escapeHtml(rsvp.dietaryOrAccessibilityNotes)}</p>`
    : "";
  const messageLine = rsvp.message
    ? `<p style="margin:0 0 8px;"><strong>${escapeHtml(T.owner.messageLabel)}</strong> ${escapeHtml(rsvp.message)}</p>`
    : "";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">${escapeHtml(ownerLabel(locale, input.created, rsvp.attending))}</h2>
      <p style="margin: 0 0 8px; font-size: 15px;"><strong>${escapeHtml(input.eventTitle)}</strong></p>
      <p style="margin: 0 0 8px; font-size: 14px;">
        <strong>${escapeHtml(rsvp.primaryName)}</strong> — ${escapeHtml(partyStatus)}
      </p>
      <p style="margin: 0 0 8px; font-size: 14px; color: #4B5563;">${escapeHtml(T.owner.contactLabel)} ${escapeHtml(contact)}</p>
      ${notesLine}
      ${messageLine}
      <p style="margin: 16px 0 0;">
        <a href="${input.dashboardUrl}" style="color: #2563EB; text-decoration: none; font-weight: 600;">${escapeHtml(T.owner.viewDashboard)}</a>
      </p>
    </div>
  `;
}

function renderOwnerSmsBody(input: {
  eventTitle: string;
  rsvp: NotificationRsvpFields;
  dashboardUrl: string;
  locale: InvitationLocale;
}): string {
  const T = notificationStrings(input.locale);
  const status = input.rsvp.attending
    ? format(T.ownerSms.attending, { count: String(input.rsvp.partySize) })
    : T.ownerSms.declined;
  return `${input.eventTitle}: ${input.rsvp.primaryName} — ${status}. ${input.dashboardUrl}`;
}

function guestEmailSubject(eventTitle: string, locale: InvitationLocale): string {
  const T = notificationStrings(locale);
  return format(T.guest.subject, { eventTitle });
}

function renderGuestConfirmationEmailHtml(input: {
  eventTitle: string;
  rsvp: Pick<NotificationRsvpFields, "primaryName" | "attending" | "partySize">;
  editUrl: string | null;
  inviteUrl: string;
  locale: InvitationLocale;
}): string {
  const T = notificationStrings(input.locale);
  const status = input.rsvp.attending
    ? format(T.guest.attendingStatus, { count: String(input.rsvp.partySize) })
    : T.guest.declinedStatus;
  const editSection = input.editUrl
    ? `<p style="margin: 16px 0 0;"><a href="${input.editUrl}" style="color: #2563EB; text-decoration: none; font-weight: 600;">${T.guest.updateRsvp}</a></p>`
    : `<p style="margin: 16px 0 0; font-size: 13px; color: #6B7280;">${format(T.guest.editFallback, {
        link: `<a href="${input.inviteUrl}" style="color: #2563EB;">${T.guest.invitationPageLinkText}</a>`,
      })}</p>`;
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">${format(T.guest.greeting, { name: escapeHtml(input.rsvp.primaryName) })}</h2>
      <p style="margin: 0 0 8px; font-size: 15px;">
        ${format(T.guest.confirmedLine, { status: escapeHtml(status), eventTitle: `<strong>${escapeHtml(input.eventTitle)}</strong>` })}
      </p>
      ${editSection}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// dispatchRsvpNotifications — pure policy, tested with fake providers.
// ---------------------------------------------------------------------------

export type NotificationEventContext = {
  id: string;
  slug: string;
  publicSubdomain?: string | null;
  title: string;
  honoreeNames: string;
  locale: InvitationLocale;
  ownerEmailNotifications: boolean;
  ownerEmailRecipients?: string[];
  ownerSmsNotifications: boolean;
  notificationEmail: string | null;
  notificationPhone: string | null;
  guestEmailConfirmations: boolean;
};

export function notificationDisplayTitle(event: Pick<NotificationEventContext, "title" | "honoreeNames">): string {
  return event.honoreeNames.trim() || event.title;
}

export function notificationInvitationUrl(event: NotificationEventContext, origin: string): string {
  return invitationPublicUrl(event, origin);
}

export type DispatchRsvpNotificationsInput = {
  event: NotificationEventContext;
  rsvp: RsvpMutationResult["rsvp"];
  created: boolean;
  editUrl: string | null;
  dashboardUrl: string;
  inviteUrl: string;
};

export type ReserveNotificationInput = {
  eventId: string;
  rsvpId: string;
  audience: InvitationNotificationAudience;
  recipient: string;
  kind: InvitationNotificationKind;
};

export type ReserveNotificationResult = { id: string; allowed: boolean };

export type NotificationDispatchDependencies = {
  savePayload(notificationId: string, payload: NotificationPayload): Promise<void>;
  reserve(
    channel: InvitationNotificationChannel,
    input: ReserveNotificationInput,
  ): Promise<ReserveNotificationResult>;
  markSent(notificationId: string, providerMessageId: string | null): Promise<void>;
  markFailed(notificationId: string, reason: string): Promise<void>;
  email: EmailSender;
  sms: SmsSender;
};

export type DispatchRsvpNotificationsResult = {
  rsvpId: string;
  suppressedChannels: InvitationNotificationChannel[];
  notificationsDelayed: boolean;
};

type PlannedAttempt = {
  channel: InvitationNotificationChannel;
  audience: InvitationNotificationAudience;
  kind: InvitationNotificationKind;
  recipient: string;
  payload(idempotencyKey: string): NotificationPayload;
};

export async function dispatchRsvpNotifications(
  input: DispatchRsvpNotificationsInput,
  dependencies: NotificationDispatchDependencies,
): Promise<DispatchRsvpNotificationsResult> {
  const { event, rsvp, created, dashboardUrl, inviteUrl } = input;
  const displayTitle = notificationDisplayTitle(event);
  const kind: InvitationNotificationKind = created ? "rsvp_created" : "rsvp_updated";
  const attempts: PlannedAttempt[] = [];

  const ownerEmailRecipients = Array.from(new Set(
    (event.ownerEmailRecipients?.length ? event.ownerEmailRecipients : [event.notificationEmail])
      .flatMap((email) => typeof email === "string" && email.trim() ? [email.trim().toLowerCase()] : []),
  ));
  if (rsvp.attending && event.ownerEmailNotifications) {
    for (const to of ownerEmailRecipients) {
    attempts.push({
      channel: "email",
      audience: "owner",
      kind,
      recipient: to,
      payload: (idempotencyKey) => ({ channel: "email", input: {
        from: EMAIL_FROM,
        to,
        subject: ownerEmailSubject({ eventTitle: displayTitle, created, rsvp, locale: event.locale }),
        html: renderOwnerEmailHtml({ eventTitle: displayTitle, created, rsvp, dashboardUrl, locale: event.locale }),
        idempotencyKey,
      } }),
    });
    }
  }

  if (rsvp.attending && event.ownerSmsNotifications && event.notificationPhone) {
    const to = event.notificationPhone;
    attempts.push({
      channel: "sms",
      audience: "owner",
      kind,
      recipient: to,
      payload: (idempotencyKey) => ({ channel: "sms", input: {
        from: twilioFromNumber || "",
        to,
        body: renderOwnerSmsBody({ eventTitle: displayTitle, rsvp, dashboardUrl, locale: event.locale }),
        idempotencyKey,
      } }),
    });
  }

  // Guest confirmations are email-only by design (schema has no
  // guest-SMS setting) and only ever sent when explicitly enabled.
  if (event.guestEmailConfirmations && rsvp.email) {
    const to = rsvp.email;
    attempts.push({
      channel: "email",
      audience: "guest",
      kind: "guest_confirmation",
      recipient: to,
      payload: (idempotencyKey) => ({ channel: "email", input: {
        from: EMAIL_FROM,
        to,
        subject: guestEmailSubject(displayTitle, event.locale),
        html: renderGuestConfirmationEmailHtml({ eventTitle: displayTitle, rsvp, editUrl: null, inviteUrl, locale: event.locale }),
        idempotencyKey,
      } }),
    });
  }

  const suppressedChannels: InvitationNotificationChannel[] = [];
  let notificationsDelayed = false;

  for (const attempt of attempts) {
    const reservation = await dependencies.reserve(attempt.channel, {
      eventId: event.id,
      rsvpId: rsvp.id,
      audience: attempt.audience,
      recipient: attempt.recipient,
      kind: attempt.kind,
    });

    if (!reservation.allowed) {
      suppressedChannels.push(attempt.channel);
      notificationsDelayed = true;
      continue;
    }

    try {
      const payload = attempt.payload(reservation.id);
      await dependencies.savePayload(reservation.id, payload);
      const result = await sendPayload(payload, dependencies);
      if (result.ok) {
        await dependencies.markSent(reservation.id, result.providerId);
      } else {
        notificationsDelayed = true;
        await dependencies.markFailed(reservation.id, sanitizeFailureReason(result.error));
      }
    } catch (error) {
      notificationsDelayed = true;
      await dependencies.markFailed(reservation.id, sanitizeFailureReason(error));
    }
  }

  return { rsvpId: rsvp.id, suppressedChannels, notificationsDelayed };
}

// ---------------------------------------------------------------------------
// Real provider adapters — degrade gracefully when credentials are absent,
// same convention as src/lib/email.ts and src/lib/sms.ts.
// ---------------------------------------------------------------------------

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM;
const twilioClient = twilioAccountSid && twilioAuthToken
  ? twilio(twilioAccountSid, twilioAuthToken)
  : null;

export const resendEmailSender: EmailSender = {
  async send(input) {
    if (!resend) return { ok: false, error: "Email delivery is not configured" };
    try {
      const result = await resend.emails.send(
        { from: input.from, to: input.to, subject: input.subject, html: input.html },
        { idempotencyKey: input.idempotencyKey },
      );
      if (!result.data?.id) {
        return { ok: false, error: sanitizeFailureReason(result.error ?? "Email provider returned no message id") };
      }
      return { ok: true, providerId: result.data.id };
    } catch (error) {
      return { ok: false, error: sanitizeFailureReason(error) };
    }
  },
};

export const twilioSmsSender: SmsSender = {
  async send(input) {
    if (!twilioClient || !twilioFromNumber) return { ok: false, error: "SMS delivery is not configured" };
    try {
      // Note: Twilio's Messages resource has no idempotency-key parameter in
      // the installed SDK (unlike Payments/UserDefinedMessage); idempotencyKey
      // is accepted here for interface symmetry with EmailSender and is not
      // forwarded to the API.
      const message = await twilioClient.messages.create({
        from: input.from,
        to: input.to,
        body: input.body,
      });
      return { ok: true, providerId: message.sid };
    } catch (error) {
      return { ok: false, error: sanitizeFailureReason(error) };
    }
  },
};

// ---------------------------------------------------------------------------
// Wired reservation + status dependencies (RPC + direct table writes).
// invitation_notifications is service-role-only, same as every other
// invitation table, so the admin client's direct .update() calls (already
// used throughout repository.ts) are sufficient for the two simple status
// flips; only the capacity-counting reservation and retry need a
// SECURITY DEFINER RPC for atomicity (see 042_invitation_notification_reservation.sql).
// ---------------------------------------------------------------------------

type ReserveRpcRow = { notification_id: string; allowed: boolean };

function isReserveRpcRow(value: unknown): value is ReserveRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.notification_id === "string" && typeof row.allowed === "boolean";
}

export async function reserveInvitationNotification(
  channel: InvitationNotificationChannel,
  input: ReserveNotificationInput,
): Promise<ReserveNotificationResult> {
  const { data, error } = await createAdminClient().rpc("reserve_invitation_notification", {
    p_event_id: input.eventId,
    p_rsvp_id: input.rsvpId,
    p_audience: input.audience,
    p_channel: channel,
    p_recipient: input.recipient,
    p_kind: input.kind,
  });
  if (error) throw new Error("Unable to reserve invitation notification", { cause: error });
  const row = Array.isArray(data) ? data[0] : data;
  if (!isReserveRpcRow(row)) throw new Error("Invalid invitation notification reservation response");
  return { id: row.notification_id, allowed: row.allowed };
}

export async function markInvitationNotificationSent(
  notificationId: string,
  providerMessageId: string | null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("invitation_notifications")
    .update({
      status: "sent",
      provider_message_id: providerMessageId,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
  if (error) throw new Error("Unable to mark invitation notification sent", { cause: error });
}

export async function markInvitationNotificationFailed(
  notificationId: string,
  reason: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("invitation_notifications")
    .update({ status: "failed", failure_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw new Error("Unable to mark invitation notification failed", { cause: error });
}

async function getInvitationNotificationEventContext(eventId: string): Promise<NotificationEventContext | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("id,slug,public_subdomain,title,honoree_names,locale,owner_email_notifications,owner_sms_notifications,notification_email,notification_phone,guest_email_confirmations")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  const { data: hostRows, error: hostError } = await client
    .from("invitation_event_hosts")
    .select("role,invitation_owners!invitation_event_hosts_owner_id_fkey!inner(email,is_active)")
    .eq("event_id", eventId)
    .eq("role", "cohost")
    .eq("invitation_owners.is_active", true);
  if (hostError) return null;
  const cohostEmails = (hostRows ?? []).flatMap((row) => {
    const relation = row.invitation_owners as unknown as { email?: unknown } | Array<{ email?: unknown }>;
    const owner = Array.isArray(relation) ? relation[0] : relation;
    return typeof owner?.email === "string" ? [owner.email] : [];
  });
  return {
    id: data.id,
    slug: data.slug,
    publicSubdomain: data.public_subdomain,
    title: data.title,
    honoreeNames: data.honoree_names,
    locale: data.locale === "es" ? "es" : "en",
    ownerEmailNotifications: data.owner_email_notifications,
    ownerEmailRecipients: [data.notification_email, ...cohostEmails].flatMap((email) => typeof email === "string" ? [email] : []),
    ownerSmsNotifications: data.owner_sms_notifications,
    notificationEmail: data.notification_email,
    notificationPhone: data.notification_phone,
    guestEmailConfirmations: data.guest_email_confirmations,
  };
}

export type DispatchInvitationRsvpNotificationsInput = {
  eventId: string;
  mutation: RsvpMutationResult;
  editUrl: string | null;
  origin: string;
};

/**
 * Real wiring for dispatchRsvpNotifications, called from the RSVP route
 * after the RPC has already committed the guest's response. This function
 * must never throw: a provider outage, a missing event row, or a bug in
 * this wiring is a "notifications delayed" outcome, never an error the
 * guest sees for a submission that already succeeded.
 */
export async function dispatchInvitationRsvpNotifications(
  input: DispatchInvitationRsvpNotificationsInput,
): Promise<{ notificationsDelayed: boolean }> {
  try {
    const event = await getInvitationNotificationEventContext(input.eventId);
    if (!event) return { notificationsDelayed: true };

    const dashboardUrl = new URL(`/invitations/manage/${input.eventId}`, input.origin).toString();
    const inviteUrl = notificationInvitationUrl(event, input.origin);
    const result = await dispatchRsvpNotifications(
      {
        event,
        rsvp: input.mutation.rsvp,
        created: input.mutation.created,
        editUrl: input.editUrl,
        dashboardUrl,
        inviteUrl,
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
    return { notificationsDelayed: result.notificationsDelayed };
  } catch {
    console.error("[invitations/notifications] dispatch failed", { eventId: input.eventId });
    return { notificationsDelayed: true };
  }
}

// ---------------------------------------------------------------------------
// processInvitationNotificationRetry — pure policy, tested with fakes.
// ---------------------------------------------------------------------------

export type RetryReservation =
  | {
      allowed: true;
      eventId: string;
      eventTitle: string;
      eventSlug: string;
      eventLocale: InvitationLocale;
      rsvpId: string;
      audience: InvitationNotificationAudience;
      channel: InvitationNotificationChannel;
      recipient: string;
      kind: InvitationNotificationKind;
    }
  | { allowed: false; code: "not_found" | "limit_reached" };

export type RetryRsvpSnapshot = NotificationRsvpFields;

export type RetryDependencies = {
  reserveRetry(notificationId: string): Promise<RetryReservation>;
  loadPayload(notificationId: string): Promise<NotificationPayload | null>;
  markSent(notificationId: string, providerMessageId: string | null): Promise<void>;
  markFailed(notificationId: string, reason: string): Promise<void>;
  email: EmailSender;
  sms: SmsSender;
};

export type RetryOutcome =
  | { ok: true; status: "sent" | "failed" }
  | { ok: false; code: "not_found" | "limit_reached" };

export async function processInvitationNotificationRetry(
  input: { notificationId: string; origin: string },
  dependencies: RetryDependencies,
): Promise<RetryOutcome> {
  const reservation = await dependencies.reserveRetry(input.notificationId);
  if (!reservation.allowed) return { ok: false, code: reservation.code };

  // From this point on, the RPC has already flipped the row to 'pending'
  // as an atomic side effect of returning `allowed: true`. Every exit path
  // below must resolve it to 'sent' or 'failed' — an uncaught exception
  // here (a missing RSVP, a provider throwing instead of returning
  // {ok:false}) must not strand the row in 'pending' forever, since retry
  // only re-accepts rows whose status is already 'failed'.
  try {
    const payload = await dependencies.loadPayload(input.notificationId);
    if (!payload || !validPayload(payload) || payload.channel !== reservation.channel
      || payload.input.to !== reservation.recipient || payload.input.idempotencyKey !== input.notificationId) {
      throw new Error("Original notification payload unavailable");
    }
    const sendResult = await sendPayload(payload, dependencies);

    if (sendResult.ok) {
      await dependencies.markSent(input.notificationId, sendResult.providerId);
      return { ok: true, status: "sent" };
    }
    await dependencies.markFailed(input.notificationId, sanitizeFailureReason(sendResult.error));
    return { ok: true, status: "failed" };
  } catch (error) {
    await dependencies.markFailed(input.notificationId, sanitizeFailureReason(error));
    return { ok: true, status: "failed" };
  }
}

type RetryRpcRow = {
  allowed: boolean;
  reason: string | null;
  event_id: string | null;
  event_title: string | null;
  event_slug: string | null;
  rsvp_id: string | null;
  audience: string | null;
  channel: string | null;
  recipient: string | null;
  kind: string | null;
};

function isRetryRpcRow(value: unknown): value is RetryRpcRow {
  return Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).allowed === "boolean";
}

// retry_invitation_notification (042_invitation_notification_reservation.sql)
// does not return the event's locale — it predates locale support in this
// content, and its RPC contract is intentionally left untouched here. This
// fetches it with a plain, non-throwing select instead: a failure to look up
// the locale must never strand the notification row, which the RPC has
// already flipped to 'pending' as a side effect of returning allowed:true.
async function getInvitationEventLocale(eventId: string): Promise<InvitationLocale> {
  try {
    const { data, error } = await createAdminClient()
      .from("invitation_events")
      .select("locale")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !data || data.locale !== "es") return "en";
    return "es";
  } catch {
    return "en";
  }
}

async function reserveInvitationNotificationRetry(notificationId: string): Promise<RetryReservation> {
  const { data, error } = await createAdminClient().rpc("retry_invitation_notification", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error("Unable to retry invitation notification", { cause: error });
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRetryRpcRow(row)) throw new Error("Invalid invitation notification retry response");

  if (!row.allowed) {
    return { allowed: false, code: row.reason === "limit_reached" ? "limit_reached" : "not_found" };
  }
  if (
    typeof row.event_id !== "string"
    || typeof row.event_title !== "string"
    || typeof row.event_slug !== "string"
    || typeof row.rsvp_id !== "string"
    || typeof row.recipient !== "string"
    || (row.audience !== "owner" && row.audience !== "guest")
    || (row.channel !== "email" && row.channel !== "sms")
    || (row.kind !== "rsvp_created" && row.kind !== "rsvp_updated" && row.kind !== "guest_confirmation")
  ) {
    throw new Error("Invalid invitation notification retry response");
  }
  const eventLocale = await getInvitationEventLocale(row.event_id);
  return {
    allowed: true,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventSlug: row.event_slug,
    eventLocale,
    rsvpId: row.rsvp_id,
    audience: row.audience,
    channel: row.channel,
    recipient: row.recipient,
    kind: row.kind,
  };
}

async function saveInvitationNotificationPayload(id: string, payload: NotificationPayload): Promise<void> {
  const sealed = sealNotificationPayload(JSON.stringify(payload), id);
  const { data, error } = await createAdminClient().from("invitation_notifications")
    .update({ provider_payload_encrypted: sealed }).eq("id", id).eq("status", "pending")
    .is("provider_payload_encrypted", null).select("id").maybeSingle();
  if (error || !data) throw new Error("Unable to persist notification payload");
}

async function loadInvitationNotificationPayload(id: string): Promise<NotificationPayload | null> {
  const { data, error } = await createAdminClient().from("invitation_notifications")
    .select("provider_payload_encrypted").eq("id", id).maybeSingle();
  if (error || !data?.provider_payload_encrypted) return null;
  const payload: unknown = JSON.parse(openNotificationPayload(data.provider_payload_encrypted, id));
  return validPayload(payload) ? payload : null;
}

/**
 * Real wiring for processInvitationNotificationRetry — the founder-only
 * retry route calls this directly, mirroring how the RSVP route calls
 * submitInvitationRsvp for the analogous pure/wired split in rsvp.ts.
 */
export async function retryInvitationNotification(
  notificationId: string,
  origin: string,
): Promise<RetryOutcome> {
  return processInvitationNotificationRetry(
    { notificationId, origin },
    {
      reserveRetry: reserveInvitationNotificationRetry,
      loadPayload: loadInvitationNotificationPayload,
      markSent: markInvitationNotificationSent,
      markFailed: markInvitationNotificationFailed,
      email: resendEmailSender,
      sms: twilioSmsSender,
    },
  );
}
