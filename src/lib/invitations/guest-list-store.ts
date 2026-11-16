import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InvitationEventStatus, InvitationLocale } from "./types";
import {
  createGuestToken,
  nextDeliveryStatus,
  type GuestDeliveryStatus,
  type GuestDraft,
  type GuestRecord,
} from "./guest-list";

export class GuestListError extends Error {
  constructor(readonly code: string, readonly errors?: Record<string, string>) {
    super(code);
  }
}

export type GuestListEventContext = {
  id: string;
  slug: string;
  publicSubdomain: string | null;
  eventType: string;
  locale: InvitationLocale;
  title: string;
  honoreeNames: string;
  startsAt: string | null;
  timezone: string;
  venueName: string | null;
  status: InvitationEventStatus;
  rsvpDeadline: string | null;
  expireAt: string | null;
  rsvpOverrideOpen: boolean;
  privateGuestListEnabled: boolean;
};

type GuestRow = {
  id: string;
  event_id: string;
  full_name: string;
  phone_e164: string;
  email: string | null;
  seats_allowed: number;
  household: string | null;
  token: string;
  delivery_status: GuestDeliveryStatus;
  sent_at: string | null;
  opened_at: string | null;
  opted_out_at: string | null;
  rsvp_attending: boolean | null;
  rsvp_party_size: number | null;
  rsvp_id: string | null;
  reminder_sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

const EVENT_COLUMNS = "id, slug, public_subdomain, event_type, locale, title, honoree_names, starts_at, timezone, venue_name, status, rsvp_deadline, expire_at, rsvp_override_open, private_guest_list_enabled";

function db() {
  return createAdminClient();
}

function asLocale(value: string): InvitationLocale {
  return value === "es" ? "es" : "en";
}

function mapEvent(row: Record<string, unknown>): GuestListEventContext {
  return {
    id: String(row.id),
    slug: String(row.slug),
    publicSubdomain: (row.public_subdomain as string | null) ?? null,
    eventType: String(row.event_type ?? "other"),
    locale: asLocale(String(row.locale ?? "en")),
    title: String(row.title ?? ""),
    honoreeNames: String(row.honoree_names ?? ""),
    startsAt: (row.starts_at as string | null) ?? null,
    timezone: String(row.timezone ?? "America/New_York"),
    venueName: (row.venue_name as string | null) ?? null,
    status: row.status as InvitationEventStatus,
    rsvpDeadline: (row.rsvp_deadline as string | null) ?? null,
    expireAt: (row.expire_at as string | null) ?? null,
    rsvpOverrideOpen: Boolean(row.rsvp_override_open),
    privateGuestListEnabled: Boolean(row.private_guest_list_enabled),
  };
}

function mapGuest(row: GuestRow, optedOutAt: string | null): GuestRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    email: row.email,
    seatsAllowed: row.seats_allowed,
    household: row.household,
    token: row.token,
    deliveryStatus: row.delivery_status,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    optedOutAt: row.opted_out_at ?? optedOutAt,
    rsvpAttending: row.rsvp_attending,
    rsvpPartySize: row.rsvp_party_size,
    rsvpId: row.rsvp_id,
    reminderSentAt: row.reminder_sent_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function optOutMap(phones: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (phones.length === 0) return found;
  const { data, error } = await db().from("invitation_sms_opt_outs").select("phone_e164, updated_at").in("phone_e164", phones);
  if (error) throw new GuestListError("store_failed");
  for (const row of data ?? []) {
    const record = row as { phone_e164: string; updated_at: string };
    found.set(record.phone_e164, record.updated_at);
  }
  return found;
}

export async function getGuestListEvent(eventId: string): Promise<GuestListEventContext | null> {
  const { data, error } = await db().from("invitation_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (error) throw new GuestListError("store_failed");
  return data ? mapEvent(data as Record<string, unknown>) : null;
}

export async function getGuestListEventBySlug(slug: string): Promise<GuestListEventContext | null> {
  const { data, error } = await db().from("invitation_events").select(EVENT_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new GuestListError("store_failed");
  return data ? mapEvent(data as Record<string, unknown>) : null;
}

export async function listGuestRecords(eventId: string): Promise<GuestRecord[]> {
  const { data, error } = await db()
    .from("invitation_guests")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new GuestListError("store_failed");
  const rows = (data ?? []) as GuestRow[];
  const optedOut = await optOutMap(rows.map((row) => row.phone_e164));
  return rows.map((row) => mapGuest(row, optedOut.get(row.phone_e164) ?? null));
}

export async function insertGuest(eventId: string, draft: GuestDraft): Promise<GuestRecord> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await db()
      .from("invitation_guests")
      .insert({
        event_id: eventId,
        full_name: draft.fullName,
        phone_e164: draft.phoneE164,
        email: draft.email,
        seats_allowed: draft.seatsAllowed,
        household: draft.household,
        token: createGuestToken(),
      })
      .select("*")
      .single();
    if (!error && data) return mapGuest(data as GuestRow, null);
    const code = (error as { code?: string; message?: string } | null)?.code;
    const message = (error as { message?: string } | null)?.message ?? "";
    if (code === "23505" && message.includes("phone")) throw new GuestListError("duplicate_phone");
    if (code === "23505" && message.includes("token")) continue;
    if (code === "23505") throw new GuestListError("duplicate_phone");
    throw new GuestListError("store_failed");
  }
  throw new GuestListError("store_failed");
}

export async function deleteGuest(eventId: string, guestId: string): Promise<boolean> {
  const { data, error } = await db().from("invitation_guests").delete().eq("event_id", eventId).eq("id", guestId).select("id");
  if (error) throw new GuestListError("store_failed");
  return (data ?? []).length > 0;
}

export async function getGuestByToken(token: string): Promise<{ guest: GuestRecord; event: GuestListEventContext } | null> {
  const { data, error } = await db().from("invitation_guests").select("*").eq("token", token).maybeSingle();
  if (error) throw new GuestListError("store_failed");
  if (!data) return null;
  const row = data as GuestRow;
  const event = await getGuestListEvent(row.event_id);
  if (!event) return null;
  const optedOut = await optOutMap([row.phone_e164]);
  return { guest: mapGuest(row, optedOut.get(row.phone_e164) ?? null), event };
}

export async function getGuestByPhone(eventId: string, phoneE164: string): Promise<GuestRecord | null> {
  const { data, error } = await db().from("invitation_guests").select("*").eq("event_id", eventId).eq("phone_e164", phoneE164).maybeSingle();
  if (error) throw new GuestListError("store_failed");
  if (!data) return null;
  const row = data as GuestRow;
  const optedOut = await optOutMap([phoneE164]);
  return mapGuest(row, optedOut.get(phoneE164) ?? null);
}

export async function markGuestOpened(guestId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("invitation_guests").update({ opened_at: now, updated_at: now }).eq("id", guestId).is("opened_at", null);
  if (error) throw new GuestListError("store_failed");
}

export async function claimInviteSend(guest: GuestRecord, now = new Date()): Promise<boolean> {
  const stamp = now.toISOString();
  let query = db()
    .from("invitation_guests")
    .update({ delivery_status: "sending", updated_at: stamp })
    .eq("id", guest.id)
    .eq("event_id", guest.eventId);
  if (guest.deliveryStatus === "sending") {
    query = query.eq("delivery_status", "sending").lt("updated_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString());
  } else {
    query = query.eq("delivery_status", "not_sent");
  }
  const { data, error } = await query.select("id");
  if (error) throw new GuestListError("store_failed");
  return (data ?? []).length > 0;
}

export async function claimReminderSend(guest: GuestRecord, now = new Date()): Promise<boolean> {
  const stamp = now.toISOString();
  let query = db().from("invitation_guests").update({ reminder_sent_at: stamp, updated_at: stamp }).eq("id", guest.id).eq("event_id", guest.eventId);
  query = guest.reminderSentAt ? query.eq("reminder_sent_at", guest.reminderSentAt) : query.is("reminder_sent_at", null);
  const { data, error } = await query.select("id");
  if (error) throw new GuestListError("store_failed");
  return (data ?? []).length > 0;
}

export async function finishInviteSend(guestId: string, result: { ok: true; sid: string } | { ok: false; error: string }): Promise<void> {
  const now = new Date().toISOString();
  const patch = result.ok
    ? { delivery_status: "sent", sent_at: now, failure_reason: null, updated_at: now }
    : { delivery_status: "failed", failed_at: now, failure_reason: result.error.slice(0, 300), updated_at: now };
  const { error } = await db().from("invitation_guests").update(patch).eq("id", guestId).eq("delivery_status", "sending");
  if (error) throw new GuestListError("store_failed");
}

export async function clearReminderClaim(guestId: string): Promise<void> {
  const { error } = await db().from("invitation_guests").update({ reminder_sent_at: null, updated_at: new Date().toISOString() }).eq("id", guestId);
  if (error) throw new GuestListError("store_failed");
}

export async function insertGuestMessage(input: {
  eventId: string;
  guestId: string | null;
  kind: "invite" | "reminder" | "verification";
  toPhone: string;
  body: string;
  segmentCount: number;
}): Promise<string> {
  const { data, error } = await db()
    .from("invitation_guest_messages")
    .insert({
      event_id: input.eventId,
      guest_id: input.guestId,
      kind: input.kind,
      to_phone: input.toPhone,
      body: input.body,
      segment_count: input.segmentCount,
      status: "queued",
    })
    .select("id")
    .single();
  if (error || !data) throw new GuestListError("store_failed");
  return String((data as { id: string }).id);
}

export async function finishGuestMessage(messageId: string, result: { ok: true; sid: string } | { ok: false; error: string }): Promise<void> {
  const now = new Date().toISOString();
  const patch = result.ok
    ? { status: "sent", twilio_sid: result.sid, updated_at: now }
    : { status: "failed", error_code: result.error.slice(0, 300), updated_at: now };
  const { error } = await db().from("invitation_guest_messages").update(patch).eq("id", messageId);
  if (error) throw new GuestListError("store_failed");
}

export async function allowGuestListAttempt(bucket: string, windowSeconds: number, maxAttempts: number): Promise<boolean> {
  const { data, error } = await db().rpc("attempt_guest_list_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error) {
    console.error("[guest-list] rate limit unavailable", { bucket, error });
    return false;
  }
  return data === true;
}

export async function saveVerificationCode(input: {
  eventId: string;
  guestId: string;
  phoneE164: string;
  codeHash: string;
  expiresAt: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db().from("invitation_guest_verifications").update({ consumed_at: now }).eq("guest_id", input.guestId).is("consumed_at", null);
  const { error } = await db().from("invitation_guest_verifications").insert({
    event_id: input.eventId,
    guest_id: input.guestId,
    phone_e164: input.phoneE164,
    code_hash: input.codeHash,
    expires_at: input.expiresAt,
  });
  if (error) throw new GuestListError("store_failed");
}

export async function consumeVerificationCode(input: {
  guestId: string;
  matches(hash: string, attempts: number, expiresAt: string): "match" | "mismatch" | "expired";
}): Promise<"match" | "mismatch" | "expired" | "missing"> {
  const { data, error } = await db()
    .from("invitation_guest_verifications")
    .select("id, code_hash, attempts, expires_at")
    .eq("guest_id", input.guestId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new GuestListError("store_failed");
  const row = (data ?? [])[0] as { id: string; code_hash: string; attempts: number; expires_at: string } | undefined;
  if (!row) return "missing";
  const outcome = input.matches(row.code_hash, row.attempts, row.expires_at);
  const now = new Date().toISOString();
  if (outcome === "match") {
    const { error: consumeError } = await db().from("invitation_guest_verifications").update({ consumed_at: now }).eq("id", row.id).is("consumed_at", null);
    if (consumeError) throw new GuestListError("store_failed");
    return "match";
  }
  if (outcome === "mismatch") {
    await db().from("invitation_guest_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  }
  return outcome;
}

export async function recordOptOut(phoneE164: string, source: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("invitation_sms_opt_outs").upsert({
    phone_e164: phoneE164,
    source,
    updated_at: now,
  });
  if (error) throw new GuestListError("store_failed");
  const { error: guestError } = await db().from("invitation_guests").update({ opted_out_at: now, updated_at: now }).eq("phone_e164", phoneE164).is("opted_out_at", null);
  if (guestError) throw new GuestListError("store_failed");
}

export async function clearOptOut(phoneE164: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("invitation_sms_opt_outs").delete().eq("phone_e164", phoneE164);
  if (error) throw new GuestListError("store_failed");
  const { error: guestError } = await db().from("invitation_guests").update({ opted_out_at: null, updated_at: now }).eq("phone_e164", phoneE164);
  if (guestError) throw new GuestListError("store_failed");
}

export async function applyDeliveryCallback(input: { sid: string; status: "sent" | "delivered" | "failed"; errorCode: string | null }): Promise<void> {
  const { data, error } = await db().from("invitation_guest_messages").select("id, guest_id, kind").eq("twilio_sid", input.sid).maybeSingle();
  if (error) throw new GuestListError("store_failed");
  if (!data) return;
  const message = data as { id: string; guest_id: string | null; kind: string };
  const now = new Date().toISOString();
  await db().from("invitation_guest_messages").update({
    status: input.status === "sent" ? "sent" : input.status,
    error_code: input.errorCode,
    updated_at: now,
  }).eq("id", message.id);
  if (!message.guest_id || message.kind === "verification") return;
  const { data: guest, error: guestError } = await db().from("invitation_guests").select("delivery_status").eq("id", message.guest_id).maybeSingle();
  if (guestError || !guest) return;
  const current = (guest as { delivery_status: GuestDeliveryStatus }).delivery_status;
  const next = nextDeliveryStatus(current, input.status);
  if (next === current) return;
  const patch: Record<string, string | null> = { delivery_status: next, updated_at: now };
  if (next === "delivered") patch.delivered_at = now;
  if (next === "failed") patch.failed_at = now;
  if (next === "sent") patch.sent_at = now;
  await db().from("invitation_guests").update(patch).eq("id", message.guest_id);
}

export async function saveGuestRsvp(guestId: string, input: { attending: boolean; partySize: number; rsvpId: string }): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("invitation_guests").update({
    rsvp_attending: input.attending,
    rsvp_party_size: input.partySize,
    rsvp_id: input.rsvpId,
    updated_at: now,
  }).eq("id", guestId);
  if (error) throw new GuestListError("store_failed");
}
