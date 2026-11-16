import "server-only";
import { dispatchInvitationRsvpNotifications } from "./notifications";
import { submitInvitationRsvp } from "./rsvp";
import { canAcceptRsvp, getEffectiveEventState } from "./state";
import {
  SEND_PER_EVENT,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_TTL_MS,
  VERIFY_CHECK_PER_PHONE,
  VERIFY_SEND_PER_IP,
  VERIFY_SEND_PER_PHONE,
  GUEST_LIST_SEND_BATCH,
  assessGuestRsvp,
  createVerificationCode,
  guestInviteUrl,
  hashVerificationCode,
  inviteSmsBody,
  mapTwilioDeliveryStatus,
  normalizeGuestPhone,
  outboundEstimate,
  parseGuestDraft,
  parseSmsKeyword,
  planOutbound,
  reminderSmsBody,
  smsSegmentCount,
  toGuestListItem,
  verificationCodeMatches,
  verificationSmsBody,
  type GuestDraft,
  type GuestListItem,
  type GuestRecord,
  type InviteCopyInput,
} from "./guest-list";
import { guestListSmsStatus, sendGuestListSms } from "./guest-list-sms";
import {
  GuestListError,
  allowGuestListAttempt,
  applyDeliveryCallback,
  claimInviteSend,
  claimReminderSend,
  clearOptOut,
  clearReminderClaim,
  consumeVerificationCode,
  deleteGuest,
  finishGuestMessage,
  finishInviteSend,
  getGuestByPhone,
  getGuestByToken,
  getGuestListEvent,
  getGuestListEventBySlug,
  insertGuest,
  insertGuestMessage,
  listGuestRecords,
  markGuestOpened,
  recordOptOut,
  saveGuestRsvp,
  saveVerificationCode,
  type GuestListEventContext,
} from "./guest-list-store";

function codeSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET ?? "";
  if (secret.length < 16) throw new GuestListError("verification_unavailable");
  return secret;
}

function copyInput(event: GuestListEventContext, guest: Pick<GuestRecord, "fullName" | "token">): InviteCopyInput {
  return {
    guestName: guest.fullName,
    honoreeNames: event.honoreeNames,
    title: event.title,
    eventType: event.eventType,
    locale: event.locale,
    startsAt: event.startsAt,
    timezone: event.timezone,
    venueName: event.venueName,
    url: guestInviteUrl(event, guest.token),
  };
}

async function requireEnabled(eventId: string): Promise<GuestListEventContext> {
  const event = await getGuestListEvent(eventId);
  if (!event) throw new GuestListError("not_found");
  if (!event.privateGuestListEnabled) throw new GuestListError("feature_disabled");
  return event;
}

export async function loadHostGuestList(eventId: string): Promise<{
  event: GuestListEventContext;
  guests: GuestListItem[];
  smsConfigured: boolean;
  smsMessage: string | null;
}> {
  const event = await requireEnabled(eventId);
  const guests = (await listGuestRecords(eventId)).map(toGuestListItem);
  const sms = guestListSmsStatus();
  return {
    event,
    guests,
    smsConfigured: sms.configured,
    smsMessage: sms.message,
  };
}

export async function addGuestToList(eventId: string, input: unknown): Promise<GuestListItem> {
  await requireEnabled(eventId);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const parsed = parseGuestDraft({
    fullName: body.fullName,
    phone: body.phone,
    email: body.email,
    seatsAllowed: body.seatsAllowed,
    household: body.household,
  });
  if (!parsed.ok) throw new GuestListError("invalid_guest", parsed.errors);
  const guest = await insertGuest(eventId, parsed.value);
  return toGuestListItem(guest);
}

export async function importGuestsToList(eventId: string, drafts: GuestDraft[]): Promise<{ added: number; skipped: number }> {
  await requireEnabled(eventId);
  let added = 0;
  let skipped = 0;
  for (const draft of drafts) {
    try {
      await insertGuest(eventId, draft);
      added += 1;
    } catch (error) {
      if (error instanceof GuestListError && error.code === "duplicate_phone") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { added, skipped };
}

export async function removeGuestFromList(eventId: string, guestId: string): Promise<void> {
  await requireEnabled(eventId);
  const removed = await deleteGuest(eventId, guestId);
  if (!removed) throw new GuestListError("not_found");
}

export async function previewGuestMessages(eventId: string, kind: "invite" | "reminder") {
  const event = await requireEnabled(eventId);
  const guests = await listGuestRecords(eventId);
  const plan = planOutbound({ kind, guests });
  const batch = plan.send.slice(0, GUEST_LIST_SEND_BATCH);
  const bodies = batch.map((guest) => (kind === "invite" ? inviteSmsBody : reminderSmsBody)(copyInput(event, guest)));
  const sms = guestListSmsStatus();
  return {
    kind,
    sampleName: batch[0]?.fullName ?? null,
    sampleBody: bodies[0] ?? "",
    ready: plan.send.length,
    sendingNow: batch.length,
    estimate: outboundEstimate(bodies),
    smsConfigured: sms.configured,
    smsMessage: sms.message,
  };
}

export async function sendGuestMessages(eventId: string, kind: "invite" | "reminder", origin: string) {
  const event = await requireEnabled(eventId);
  if (!guestListSmsStatus().configured) throw new GuestListError("sms_not_configured");
  const guests = await listGuestRecords(eventId);
  const plan = planOutbound({ kind, guests });
  const batch = plan.send.slice(0, GUEST_LIST_SEND_BATCH);
  let sent = 0;
  let failed = 0;
  const callback = `${origin.replace(/\/$/, "")}/api/invitations/twilio/status`;
  for (const guest of batch) {
    const allowed = await allowGuestListAttempt(`send:event:${eventId}`, SEND_PER_EVENT.windowSeconds, SEND_PER_EVENT.max);
    if (!allowed) break;
    const claimed = kind === "invite" ? await claimInviteSend(guest) : await claimReminderSend(guest);
    if (!claimed) continue;
    const body = (kind === "invite" ? inviteSmsBody : reminderSmsBody)(copyInput(event, guest));
    const segments = smsSegmentCount(body).segments;
    const messageId = await insertGuestMessage({
      eventId,
      guestId: guest.id,
      kind,
      toPhone: guest.phoneE164,
      body,
      segmentCount: segments,
    });
    const result = await sendGuestListSms({ to: guest.phoneE164, body, statusCallback: callback });
    await finishGuestMessage(messageId, result);
    if (kind === "invite") await finishInviteSend(guest.id, result);
    else if (!result.ok) await clearReminderClaim(guest.id);
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed, remaining: Math.max(plan.send.length - sent - failed, 0) };
}

export async function requestGuestVerification(input: { slug: string; phone: string; ipHash: string }) {
  const event = await getGuestListEventBySlug(input.slug);
  if (!event || !event.privateGuestListEnabled) throw new GuestListError("not_found");
  const state = getEffectiveEventState(event, new Date());
  if (!canAcceptRsvp(state)) throw new GuestListError("rsvp_closed");
  const phone = normalizeGuestPhone(input.phone);
  if (!phone) throw new GuestListError("invalid_phone");
  const ipAllowed = await allowGuestListAttempt(`verify:ip:${input.ipHash}`, VERIFY_SEND_PER_IP.windowSeconds, VERIFY_SEND_PER_IP.max);
  const phoneAllowed = await allowGuestListAttempt(`verify:phone:${phone}`, VERIFY_SEND_PER_PHONE.windowSeconds, VERIFY_SEND_PER_PHONE.max);
  if (!ipAllowed || !phoneAllowed) throw new GuestListError("rate_limited");
  const guest = await getGuestByPhone(event.id, phone);
  if (!guest) return { result: "not_on_list" as const };
  if (guest.optedOutAt) return { result: "opted_out" as const };
  if (!guestListSmsStatus().configured) throw new GuestListError("sms_not_configured");
  const code = createVerificationCode();
  const secret = codeSecret();
  await saveVerificationCode({
    eventId: event.id,
    guestId: guest.id,
    phoneE164: phone,
    codeHash: hashVerificationCode(code, guest.id, secret),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
  });
  const body = verificationSmsBody(code, event.locale);
  const messageId = await insertGuestMessage({
    eventId: event.id,
    guestId: guest.id,
    kind: "verification",
    toPhone: phone,
    body: event.locale === "es" ? "Código de verificación de InviteSpot" : "InviteSpot verification code",
    segmentCount: smsSegmentCount(body).segments,
  });
  const result = await sendGuestListSms({ to: phone, body });
  await finishGuestMessage(messageId, result);
  if (!result.ok) throw new GuestListError("sms_failed");
  return { result: "code_sent" as const };
}

export async function checkGuestVerification(input: { slug: string; phone: string; code: string; ipHash: string }) {
  const event = await getGuestListEventBySlug(input.slug);
  if (!event || !event.privateGuestListEnabled) throw new GuestListError("not_found");
  const phone = normalizeGuestPhone(input.phone);
  if (!phone || !/^\d{6}$/.test(input.code)) throw new GuestListError("invalid_code");
  const allowed = await allowGuestListAttempt(`verify-check:${phone}:${input.ipHash}`, VERIFY_CHECK_PER_PHONE.windowSeconds, VERIFY_CHECK_PER_PHONE.max);
  if (!allowed) throw new GuestListError("rate_limited");
  const guest = await getGuestByPhone(event.id, phone);
  if (!guest) return { result: "not_on_list" as const };
  const secret = codeSecret();
  const outcome = await consumeVerificationCode({
    guestId: guest.id,
    matches(hash, attempts, expiresAt) {
      if (attempts >= VERIFICATION_MAX_ATTEMPTS || Date.parse(expiresAt) <= Date.now()) return "expired";
      return verificationCodeMatches(input.code, guest.id, hash, secret) ? "match" : "mismatch";
    },
  });
  if (outcome === "match") return { result: "verified" as const, href: `/i/${guest.token}` };
  if (outcome === "expired") throw new GuestListError("code_expired");
  throw new GuestListError("invalid_code");
}

export async function loadPersonalInvitation(token: string) {
  const loaded = await getGuestByToken(token);
  if (!loaded || !loaded.event.privateGuestListEnabled) return null;
  const state = getEffectiveEventState(loaded.event, new Date());
  if (state === "draft" || state === "offline" || state === "expired") return null;
  await markGuestOpened(loaded.guest.id);
  return { ...loaded, state };
}

export async function submitPersonalInvitationRsvp(input: {
  token: string;
  attending: boolean;
  partySize: number;
  origin: string;
}) {
  const loaded = await getGuestByToken(input.token);
  if (!loaded || !loaded.event.privateGuestListEnabled) throw new GuestListError("not_found");
  const state = getEffectiveEventState(loaded.event, new Date());
  if (!canAcceptRsvp(state)) throw new GuestListError("rsvp_closed");
  const party = assessGuestRsvp({
    attending: input.attending,
    partySize: input.partySize,
    seatsAllowed: loaded.guest.seatsAllowed,
  });
  if (!party.ok) throw new GuestListError(party.code);
  const submitted = await submitInvitationRsvp({
    eventId: loaded.event.id,
    rsvpId: loaded.guest.rsvpId ?? undefined,
    credentialMode: loaded.guest.rsvpId ? "administrative" : "guest",
    input: {
      primaryName: loaded.guest.fullName,
      email: loaded.guest.email,
      phone: loaded.guest.phoneE164,
      attending: input.attending,
      partySize: party.partySize,
      additionalGuestNames: [],
      dietaryOrAccessibilityNotes: null,
      message: null,
    },
  });
  if (!submitted.ok) throw new GuestListError(submitted.code);
  await saveGuestRsvp(loaded.guest.id, {
    attending: input.attending,
    partySize: party.partySize,
    rsvpId: submitted.value.rsvpId,
  });
  try {
    await dispatchInvitationRsvpNotifications({
      eventId: loaded.event.id,
      mutation: submitted.value,
      editUrl: guestInviteUrl(loaded.event, loaded.guest.token),
      origin: input.origin,
    });
  } catch (error) {
    console.error("[guest-list] rsvp notification failed", { eventId: loaded.event.id, error });
  }
  return {
    name: loaded.guest.fullName,
    attending: input.attending,
    partySize: party.partySize,
  };
}

export async function handleTwilioStatus(params: Record<string, string>): Promise<void> {
  const sid = params.MessageSid || params.SmsSid || "";
  const raw = params.MessageStatus || params.SmsStatus || "";
  if (!sid || !raw) return;
  const status = mapTwilioDeliveryStatus(raw);
  if (!status) return;
  await applyDeliveryCallback({ sid, status, errorCode: params.ErrorCode || null });
}

export async function handleTwilioInbound(params: Record<string, string>): Promise<void> {
  const phone = normalizeGuestPhone(params.From || "");
  const keyword = parseSmsKeyword(params.Body || "");
  if (!phone || !keyword) return;
  if (keyword === "stop") await recordOptOut(phone, "stop");
  else await clearOptOut(phone);
}
