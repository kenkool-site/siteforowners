import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  assessGuestRsvp,
  createGuestToken,
  displayStatus,
  guestInviteUrl,
  guestListStats,
  hashVerificationCode,
  inviteSmsBody,
  isInviteCandidate,
  isReminderCandidate,
  mapTwilioDeliveryStatus,
  nextDeliveryStatus,
  normalizeGuestPhone,
  parseGuestCsv,
  parseGuestDraft,
  parseSmsKeyword,
  planOutbound,
  reminderSmsBody,
  replySummary,
  smsSegmentCount,
  twilioSignatureMatches,
  verificationCodeMatches,
  verificationSmsBody,
  type GuestRecord,
} from "./guest-list";
import { readGuestListSmsConfig } from "./guest-list-sms";
import { previewGuests, previewInviteBody, previewInviteEstimate } from "./guest-list-fixtures";
import { parseEventUpdate } from "./validation";
import { processPublicRsvpRequest } from "./rsvp";

const wedding = {
  guestName: "Chanelle Wyche-Afolabi",
  honoreeNames: "Mercy & John",
  title: "Mercy & John",
  eventType: "wedding",
  locale: "en" as const,
  startsAt: "2026-12-19T19:00:00.000Z",
  timezone: "America/Chicago",
  venueName: "The Bliss at Aubrey",
  url: "https://mercy-john.invitespot.app/i/K7mQ2pLx9aWc4nRb",
};

function guest(overrides: Partial<GuestRecord> = {}): GuestRecord {
  return {
    id: "g1",
    eventId: "e1",
    fullName: "Ada Lovelace",
    phoneE164: "+12145550100",
    email: null,
    seatsAllowed: 2,
    household: null,
    token: "K7mQ2pLx9aWc4nRb",
    deliveryStatus: "not_sent",
    sentAt: null,
    openedAt: null,
    optedOutAt: null,
    rsvpAttending: null,
    rsvpPartySize: null,
    rsvpId: null,
    reminderSentAt: null,
    failureReason: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

test("phones normalize to US E.164 and reject junk", () => {
  assert.equal(normalizeGuestPhone("(214) 555-0192"), "+12145550192");
  assert.equal(normalizeGuestPhone("2145550192"), "+12145550192");
  assert.equal(normalizeGuestPhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeGuestPhone("555"), null);
  assert.equal(normalizeGuestPhone(""), null);
});

test("guest tokens are unguessable and url-safe", () => {
  const token = createGuestToken();
  assert.match(token, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(token, createGuestToken());
});

test("invitation texts name the host, include the personal link, and the STOP opt-out", () => {
  const body = inviteSmsBody(wedding);
  assert.match(body, /Hi Chanelle, Mercy & John invite you to their wedding, Saturday, December 19, 2026, at The Bliss at Aubrey\./);
  assert.match(body, /https:\/\/mercy-john\.invitespot\.app\/i\/K7mQ2pLx9aWc4nRb/);
  assert.match(body, /Reply STOP to opt out/);
  assert.equal(smsSegmentCount(body).encoding, "gsm");
  assert.ok(smsSegmentCount(body).segments >= 2);

  const birthday = inviteSmsBody({ ...wedding, eventType: "birthday", guestName: "Ana Ruiz", honoreeNames: "Ana Ruiz" });
  assert.match(birthday, /their birthday celebration/);
  assert.doesNotMatch(birthday, /wedding/);

  const party = inviteSmsBody({ ...wedding, eventType: "party", title: "Garden Party", honoreeNames: "The Okonkwos" });
  assert.match(party, /The Okonkwos invite you to Garden Party/);

  const spanish = inviteSmsBody({ ...wedding, locale: "es" });
  assert.match(spanish, /^Hola Chanelle/);
  assert.match(spanish, /su boda/);
  assert.match(spanish, /Responde STOP para cancelar/);

  const reminder = reminderSmsBody(wedding);
  assert.match(reminder, /reminder from Mercy & John/);
  assert.match(reminder, /Reply STOP to opt out/);
  assert.ok(reminder.length < body.length);
});

test("verification texts expire and include STOP", () => {
  const body = verificationSmsBody("482913", "en");
  assert.match(body, /482913/);
  assert.match(body, /10 minutes/);
  assert.match(body, /Reply STOP to opt out/);
});

test("personal links use the event subdomain when one exists", () => {
  assert.equal(
    guestInviteUrl({ slug: "mercy-john", publicSubdomain: "mercy-john" }, "K7mQ2pLx9aWc4nRb"),
    "https://mercy-john.invitespot.app/i/K7mQ2pLx9aWc4nRb",
  );
  assert.equal(
    guestInviteUrl({ slug: "garden-party", publicSubdomain: null }, "K7mQ2pLx9aWc4nRb", "https://www.invitespot.app"),
    "https://www.invitespot.app/i/K7mQ2pLx9aWc4nRb",
  );
});

test("display status keeps a reply visible and still marks opt-outs", () => {
  assert.equal(displayStatus(guest()), "not_sent");
  assert.equal(displayStatus(guest({ deliveryStatus: "sent" })), "sent");
  assert.equal(displayStatus(guest({ deliveryStatus: "delivered", openedAt: "2026-11-02T00:00:00.000Z" })), "opened");
  assert.equal(displayStatus(guest({ rsvpAttending: true })), "attending");
  assert.equal(displayStatus(guest({ rsvpAttending: false })), "declined");
  assert.equal(displayStatus(guest({ deliveryStatus: "failed" })), "failed");
  assert.equal(displayStatus(guest({ optedOutAt: "2026-11-02T00:00:00.000Z" })), "opted_out");
  assert.equal(displayStatus(guest({ optedOutAt: "2026-11-02T00:00:00.000Z", rsvpAttending: true })), "attending");
});

test("nothing is selected to text until the host sends, and opted-out numbers are skipped", () => {
  const opted = guest({ id: "opt", optedOutAt: "2026-11-02T00:00:00.000Z" });
  const fresh = guest({ id: "fresh" });
  const sent = guest({ id: "sent", deliveryStatus: "sent", sentAt: "2026-11-02T00:00:00.000Z" });
  const opened = guest({ id: "open", deliveryStatus: "delivered", openedAt: "2026-11-02T00:00:00.000Z" });
  const replied = guest({ id: "yes", deliveryStatus: "delivered", rsvpAttending: true, rsvpPartySize: 2 });
  const invites = planOutbound({ kind: "invite", guests: [opted, fresh, sent, replied] });
  assert.deepEqual(invites.send.map((item) => item.id), ["fresh"]);
  assert.deepEqual(invites.skippedOptOut.map((item) => item.id), ["opt"]);
  const reminders = planOutbound({ kind: "reminder", guests: [sent, opened, replied, fresh, opted] });
  assert.deepEqual(reminders.send.map((item) => item.id), ["sent", "open"]);
  assert.equal(isInviteCandidate(sent), false);
  assert.equal(isReminderCandidate(replied), false);
  assert.equal(isReminderCandidate(sent, new Date("2026-11-03T00:00:00.000Z")), true);
  assert.equal(isReminderCandidate({ ...sent, reminderSentAt: "2026-11-02T12:00:00.000Z" }, new Date("2026-11-02T13:00:00.000Z")), false);
});

test("delivery callbacks do not downgrade a delivered invite", () => {
  assert.equal(mapTwilioDeliveryStatus("undelivered"), "failed");
  assert.equal(mapTwilioDeliveryStatus("delivered"), "delivered");
  assert.equal(nextDeliveryStatus("sent", "delivered"), "delivered");
  assert.equal(nextDeliveryStatus("delivered", "sent"), "delivered");
  assert.equal(nextDeliveryStatus("sent", "failed"), "failed");
});

test("party size cannot pass the seats the host allowed", () => {
  assert.deepEqual(assessGuestRsvp({ attending: true, partySize: 2, seatsAllowed: 2 }), { ok: true, partySize: 2 });
  assert.deepEqual(assessGuestRsvp({ attending: false, partySize: 4, seatsAllowed: 2 }), { ok: true, partySize: 0 });
  assert.equal(assessGuestRsvp({ attending: true, partySize: 3, seatsAllowed: 2 }).ok, false);
  assert.equal(assessGuestRsvp({ attending: true, partySize: 0, seatsAllowed: 2 }).ok, false);
});

test("csv import reads name, mobile, seats, email, and household without sending", () => {
  const parsed = parseGuestCsv("Name,Mobile,Seats,Email,Household\nAda Lovelace,(214) 555-0100,2,ada@example.com,Lovelace\nBad,12,2,,\n");
  assert.equal(parsed.guests.length, 1);
  assert.equal(parsed.guests[0]?.phoneE164, "+12145550100");
  assert.equal(parsed.guests[0]?.seatsAllowed, 2);
  assert.equal(parsed.guests[0]?.email, "ada@example.com");
  assert.equal(parsed.guests[0]?.household, "Lovelace");
  assert.equal(parsed.errors.length, 1);
  const draft = parseGuestDraft({ fullName: "Ada", phone: "2145550100", seatsAllowed: 1 });
  assert.equal(draft.ok, true);
});

test("verification codes are stored only as a hash and expire by attempt rules", () => {
  const hash = hashVerificationCode("482913", "guest-1", "secret-secret-secret");
  assert.equal(verificationCodeMatches("482913", "guest-1", hash, "secret-secret-secret"), true);
  assert.equal(verificationCodeMatches("482914", "guest-1", hash, "secret-secret-secret"), false);
  assert.equal(hash.includes("482913"), false);
});

test("STOP and START are exact keywords", () => {
  assert.equal(parseSmsKeyword("STOP"), "stop");
  assert.equal(parseSmsKeyword("stop."), "stop");
  assert.equal(parseSmsKeyword("START"), "start");
  assert.equal(parseSmsKeyword("Yes I'll be there"), null);
  assert.equal(parseSmsKeyword("unsubscribe"), "stop");
});

test("Twilio signatures reject a tampered body", () => {
  const params: Record<string, string> = { From: "+12145550100", Body: "STOP" };
  const url = "https://www.invitespot.app/api/invitations/twilio/inbound";
  const payload = Object.keys(params).sort().reduce((data, key) => data + key + params[key], url);
  const signature = createHmac("sha1", "token").update(payload).digest("base64");
  assert.equal(twilioSignatureMatches("token", signature, url, params), true);
  assert.equal(twilioSignatureMatches("token", signature, url, { ...params, Body: "START" }), false);
  assert.equal(twilioSignatureMatches("token", "", url, params), false);
});

test("sms config is off when Twilio env is missing and does not throw", () => {
  assert.equal(readGuestListSmsConfig({}).configured, false);
  const ready = readGuestListSmsConfig({
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_MESSAGING_SERVICE_SID: "MG123",
  });
  assert.equal(ready.configured, true);
  const fromNumber = readGuestListSmsConfig({
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_FROM: "+15555550100",
  });
  assert.equal(fromNumber.configured, true);
});

test("the sample guest list matches the reply totals used on the host screens", () => {
  const stats = guestListStats(previewGuests);
  assert.equal(stats.guests, 24);
  assert.equal(stats.attendingSeats, 17);
  assert.equal(stats.seatsReserved, 42);
  assert.equal(stats.byStatus.not_sent, 3);
  assert.equal(stats.byStatus.sent, 4);
  assert.equal(stats.byStatus.opened, 5);
  assert.equal(stats.byStatus.attending, 9);
  assert.equal(stats.byStatus.declined, 2);
  assert.equal(stats.byStatus.failed, 1);
  const summary = replySummary(previewGuests);
  assert.equal(summary.opened, 16);
  assert.equal(summary.waiting, 12);
  assert.equal(summary.remindable, 9);
  assert.equal(summary.declined, 2);
  assert.match(previewInviteBody, /Reply STOP to opt out/);
  assert.equal(previewInviteEstimate.invitations, 3);
  assert.equal(previewInviteEstimate.segments, previewInviteEstimate.perMessage * 3);
});

test("only a founder can turn the private guest list on", () => {
  const founder = parseEventUpdate({ privateGuestListEnabled: true }, "founder");
  assert.equal(founder.ok && founder.value.privateGuestListEnabled, true);
  const owner = parseEventUpdate({ privateGuestListEnabled: true, title: "Garden Party" }, "owner");
  assert.equal(owner.ok, true);
  if (owner.ok) assert.equal("privateGuestListEnabled" in owner.value, false);
  const invalid = parseEventUpdate({ privateGuestListEnabled: "yes" }, "founder");
  assert.equal(invalid.ok, false);
});

test("open RSVP stays available when the private list is off and is rejected when it is on", async () => {
  const base = {
    event: {
      id: "event-1",
      slug: "garden-party",
      status: "published" as const,
      rsvpDeadline: null,
      expireAt: null,
      rsvpOverrideOpen: false,
      showPublicRsvpCount: false,
    },
    passcodeHash: null,
  };
  const body = {
    slug: "garden-party",
    rsvp: { primaryName: "Ana", email: "ana@example.com", attending: true, partySize: 2, additionalGuestNames: [] },
  };
  let submitted = false;
  const open = await processPublicRsvpRequest({
    body,
    ipHash: "a".repeat(64),
    readPasscodeCookie: () => null,
    origin: "https://example.test",
    now: new Date("2026-11-15T00:00:00.000Z"),
  }, {
    findInvitation: async () => base,
    verifyPasscode: async () => true,
    allowAttempt: async () => true,
    submit: async () => {
      submitted = true;
      return { ok: true, value: { rsvp: { id: "r", eventId: "event-1", primaryName: "Ana", email: "ana@example.com", phone: null, attending: true, partySize: 2, additionalGuestNames: [], dietaryOrAccessibilityNotes: null, message: null, editTokenHash: "", lastNotifiedAt: null, createdAt: "", updatedAt: "" }, rsvpId: "r", created: true, outcome: "created", attendingTotal: 2, declinedPartyTotal: 0, remainingCapacity: null, editToken: "token" } };
    },
  });
  assert.equal(open.status, 200);
  assert.equal(submitted, true);

  const closed = await processPublicRsvpRequest({
    body,
    ipHash: "a".repeat(64),
    readPasscodeCookie: () => null,
    origin: "https://example.test",
    now: new Date("2026-11-15T00:00:00.000Z"),
  }, {
    findInvitation: async () => ({ ...base, event: { ...base.event, privateGuestListEnabled: true } }),
    verifyPasscode: async () => true,
    allowAttempt: async () => { throw new Error("rate limit must not run"); },
    submit: async () => { throw new Error("open RSVP must not be stored"); },
  });
  assert.equal(closed.status, 403);
  assert.equal(closed.body.code, "invite_only");
});

test("adding or importing a guest never calls the send path", () => {
  const addRoute = readFileSync(new URL("../../app/api/invitations/events/[eventId]/guests/route.ts", import.meta.url), "utf8");
  const importRoute = readFileSync(new URL("../../app/api/invitations/events/[eventId]/guests/import/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(addRoute, /sendGuestMessages|sendGuestListSms/);
  assert.doesNotMatch(importRoute, /sendGuestMessages|sendGuestListSms/);
});

test("private guest list migration locks the flag off and keeps service-role access", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/069_invitation_private_guest_list.sql", import.meta.url), "utf8");
  assert.match(sql, /private_guest_list_enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.invitation_guests/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.attempt_guest_list_rate_limit/);
  assert.match(sql, /invitation_sms_opt_outs/);
  assert.match(sql, /token ~ '\^\[A-Za-z0-9_-\]\{16,64\}\$'/);
});
