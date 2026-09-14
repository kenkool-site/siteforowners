import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchRsvpNotifications,
  processInvitationNotificationRetry,
  type DispatchRsvpNotificationsInput,
  type NotificationDispatchDependencies,
  type NotificationEventContext,
  type ReserveNotificationResult,
  type RetryDependencies,
  type RetryReservation,
} from "./notifications";
import type { RsvpMutationResult } from "./types";

const baseEvent: NotificationEventContext = {
  id: "event-1",
  slug: "sample-event",
  title: "Sample Wedding",
  ownerEmailNotifications: true,
  ownerSmsNotifications: false,
  notificationEmail: "owner@example.com",
  notificationPhone: null,
  guestEmailConfirmations: false,
};

const baseRsvp: RsvpMutationResult["rsvp"] = {
  id: "rsvp-1",
  eventId: "event-1",
  primaryName: "Jamie Guest",
  email: "guest@example.com",
  phone: null,
  attending: true,
  partySize: 2,
  additionalGuestNames: [],
  dietaryOrAccessibilityNotes: null,
  message: null,
};

const fixture: DispatchRsvpNotificationsInput = {
  event: baseEvent,
  rsvp: baseRsvp,
  created: true,
  editUrl: "https://events.example.test/invite/sample-event#rsvpId=rsvp-1&editToken=secret",
  dashboardUrl: "https://events.example.test/invitations/manage/event-1",
  inviteUrl: "https://events.example.test/invite/sample-event",
};

const smsFixture: DispatchRsvpNotificationsInput = {
  ...fixture,
  event: {
    ...baseEvent,
    ownerEmailNotifications: false,
    ownerSmsNotifications: true,
    notificationEmail: null,
    notificationPhone: "+15555550123",
  },
};

function alwaysAllow(): NotificationDispatchDependencies {
  return {
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => ({ ok: true, providerId: "e1" }) },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  };
}

test("RSVP remains successful when owner email fails", async () => {
  const stored: string[] = [];
  const result = await dispatchRsvpNotifications(fixture, {
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async (id) => { stored.push(id); },
    email: { send: async () => ({ ok: false, error: "provider unavailable" }) },
    sms: { send: async () => ({ ok: true, providerId: "SM1" }) },
  });
  assert.equal(result.rsvpId, fixture.rsvp.id);
  assert.deepEqual(stored, ["n-email"]);
  assert.equal(result.notificationsDelayed, true);
});

test("a reached SMS limit records suppression without calling Twilio", async () => {
  let calls = 0;
  const result = await dispatchRsvpNotifications(smsFixture, {
    reserve: async () => ({ id: "n-sms", allowed: false }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => ({ ok: true, providerId: "e1" }) },
    sms: { send: async () => { calls += 1; return { ok: true, providerId: "SM1" }; } },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.suppressedChannels, ["sms"]);
  assert.equal(result.notificationsDelayed, true);
});

test("a reached email limit records suppression without calling Resend", async () => {
  let calls = 0;
  const result = await dispatchRsvpNotifications(fixture, {
    reserve: async () => ({ id: "n-email", allowed: false }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => { calls += 1; return { ok: true, providerId: "e1" }; } },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.suppressedChannels, ["email"]);
});

test("everything sending successfully leaves nothing suppressed or delayed", async () => {
  const result = await dispatchRsvpNotifications(fixture, alwaysAllow());
  assert.deepEqual(result.suppressedChannels, []);
  assert.equal(result.notificationsDelayed, false);
});

test("a provider throwing is recorded as a failure, not an unhandled rejection", async () => {
  const failed: Array<{ id: string; reason: string }> = [];
  const result = await dispatchRsvpNotifications(fixture, {
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async (id, reason) => { failed.push({ id, reason }); },
    email: { send: async () => { throw new Error("network blip"); } },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  });
  assert.deepEqual(failed, [{ id: "n-email", reason: "network blip" }]);
  assert.equal(result.notificationsDelayed, true);
});

test("guest confirmation is only attempted when enabled and the guest has an email", async () => {
  async function plannedAttempts(input: DispatchRsvpNotificationsInput) {
    const calls: Array<{ channel: string; audience: string; kind: string }> = [];
    await dispatchRsvpNotifications(input, {
      reserve: async (channel, reserveInput) => {
        calls.push({ channel, audience: reserveInput.audience, kind: reserveInput.kind });
        return { id: `n-${calls.length}`, allowed: true };
      },
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    });
    return calls;
  }

  const enabledWithEmail = await plannedAttempts({
    ...fixture,
    event: { ...baseEvent, guestEmailConfirmations: true },
  });
  assert.deepEqual(enabledWithEmail, [
    { channel: "email", audience: "owner", kind: "rsvp_created" },
    { channel: "email", audience: "guest", kind: "guest_confirmation" },
  ]);

  const enabledNoEmail = await plannedAttempts({
    ...fixture,
    rsvp: { ...baseRsvp, email: null },
    event: { ...baseEvent, guestEmailConfirmations: true },
  });
  assert.deepEqual(enabledNoEmail, [
    { channel: "email", audience: "owner", kind: "rsvp_created" },
  ]);

  const disabled = await plannedAttempts({
    ...fixture,
    event: { ...baseEvent, guestEmailConfirmations: false },
  });
  assert.deepEqual(disabled, [
    { channel: "email", audience: "owner", kind: "rsvp_created" },
  ]);
});

test("a guest is never sent SMS, even when the owner gets SMS and the guest has a phone number", async () => {
  let smsCalls = 0;
  const input: DispatchRsvpNotificationsInput = {
    ...fixture,
    rsvp: { ...baseRsvp, phone: "+15555550199" },
    event: {
      ...baseEvent,
      ownerSmsNotifications: true,
      notificationPhone: "+15555550123",
      guestEmailConfirmations: true,
    },
  };
  const calls: Array<{ channel: string; audience: string }> = [];
  await dispatchRsvpNotifications(input, {
    reserve: async (channel, reserveInput) => {
      calls.push({ channel, audience: reserveInput.audience });
      return { id: `n-${calls.length}`, allowed: true };
    },
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => ({ ok: true, providerId: "e1" }) },
    sms: { send: async () => { smsCalls += 1; return { ok: true, providerId: "s1" }; } },
  });
  assert.equal(smsCalls, 1);
  assert.equal(calls.some((c) => c.channel === "sms" && c.audience === "guest"), false);
  assert.deepEqual(calls, [
    { channel: "email", audience: "owner" },
    { channel: "sms", audience: "owner" },
    { channel: "email", audience: "guest" },
  ]);
});

test("the reservation id is reused as the provider idempotency key", async () => {
  const receivedKeys: string[] = [];
  await dispatchRsvpNotifications(fixture, {
    reserve: async () => ({ id: "reservation-abc", allowed: true }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async (input) => { receivedKeys.push(input.idempotencyKey); return { ok: true, providerId: "e1" }; } },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  });
  assert.deepEqual(receivedKeys, ["reservation-abc"]);
});

test("authored fields are escaped in the owner notification email", async () => {
  let html = "";
  const maliciousRsvp: RsvpMutationResult["rsvp"] = {
    ...baseRsvp,
    primaryName: "<script>alert(1)</script>",
    message: "See <b>you</b> there & thanks!",
    dietaryOrAccessibilityNotes: "no nuts <img src=x>",
  };
  await dispatchRsvpNotifications(
    { ...fixture, rsvp: maliciousRsvp },
    {
      reserve: async () => ({ id: "n-email", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { html = input.html; return { ok: true, providerId: "e1" }; } },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /no nuts &lt;img/);
});

test("guest confirmation email includes the private edit link when one is supplied", async () => {
  let html = "";
  await dispatchRsvpNotifications(
    { ...fixture, event: { ...baseEvent, guestEmailConfirmations: true } },
    {
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { if (input.subject.startsWith("Your RSVP")) html = input.html; return { ok: true, providerId: "e1" }; } },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.match(html, new RegExp(fixture.editUrl!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("an RSVP update mints no new edit token, so its guest confirmation email falls back to the invite page", async () => {
  // Mirrors the retry case: on update, submitRsvp's credential.token is
  // null (see rsvp.ts submitRsvp), so processPublicRsvpRequest never sets
  // editUrl — this isn't a retry-only edge case, both paths share the same
  // fallback rendering.
  let html = "";
  await dispatchRsvpNotifications(
    { ...fixture, created: false, editUrl: null, event: { ...baseEvent, guestEmailConfirmations: true } },
    {
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { if (input.subject.startsWith("Your RSVP")) html = input.html; return { ok: true, providerId: "e1" }; } },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.doesNotMatch(html, /editToken/);
  assert.match(html, new RegExp(fixture.inviteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

// ---------------------------------------------------------------------------
// processInvitationNotificationRetry
// ---------------------------------------------------------------------------

function notCalled(name: string) {
  return async () => { throw new Error(`${name} must not be called`); };
}

const ownerFailedReservation: RetryReservation = {
  allowed: true,
  eventId: "event-1",
  eventTitle: "Sample Wedding",
  eventSlug: "sample-event",
  rsvpId: "rsvp-1",
  audience: "owner",
  channel: "email",
  recipient: "owner@example.com",
  kind: "rsvp_created",
};

const rsvpSnapshot = {
  primaryName: "Jamie Guest",
  email: "guest@example.com",
  phone: null,
  attending: true,
  partySize: 2,
  dietaryOrAccessibilityNotes: null,
  message: null,
};

test("retry only accepts a currently-failed notification", async () => {
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ({ allowed: false, code: "not_found" }),
    getRsvpSnapshot: notCalled("getRsvpSnapshot"),
    markSent: notCalled("markSent"),
    markFailed: notCalled("markFailed"),
    email: { send: notCalled("email.send") },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: false, code: "not_found" });
});

test("retry respects the current channel limit", async () => {
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ({ allowed: false, code: "limit_reached" }),
    getRsvpSnapshot: notCalled("getRsvpSnapshot"),
    markSent: notCalled("markSent"),
    markFailed: notCalled("markFailed"),
    email: { send: notCalled("email.send") },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: false, code: "limit_reached" });
});

test("a successful retry reuses the notification id as the idempotency key and marks sent", async () => {
  let receivedKey = "";
  let sentArgs: [string, string | null] | null = null;
  const dependencies: RetryDependencies = {
    reserveRetry: async (id) => { assert.equal(id, "notif-1"); return ownerFailedReservation; },
    getRsvpSnapshot: async () => rsvpSnapshot,
    markSent: async (id, providerMessageId) => { sentArgs = [id, providerMessageId]; },
    markFailed: notCalled("markFailed"),
    email: { send: async (input) => { receivedKey = input.idempotencyKey; return { ok: true, providerId: "prov-1" }; } },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: true, status: "sent" });
  assert.equal(receivedKey, "notif-1");
  assert.deepEqual(sentArgs, ["notif-1", "prov-1"]);
});

test("a retry that fails again is marked failed, not thrown", async () => {
  let failedArgs: [string, string] | null = null;
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ownerFailedReservation,
    getRsvpSnapshot: async () => rsvpSnapshot,
    markSent: notCalled("markSent"),
    markFailed: async (id, reason) => { failedArgs = [id, reason]; },
    email: { send: async () => ({ ok: false, error: "still down" }) },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: true, status: "failed" });
  assert.deepEqual(failedArgs, ["notif-1", "still down"]);
});

test("retrying an owner SMS notification calls the SMS sender, not email", async () => {
  let smsCalled = false;
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ({ ...ownerFailedReservation, channel: "sms", recipient: "+15555550123" }),
    getRsvpSnapshot: async () => rsvpSnapshot,
    markSent: async () => undefined,
    markFailed: notCalled("markFailed"),
    email: { send: notCalled("email.send") },
    sms: { send: async () => { smsCalled = true; return { ok: true, providerId: "SM1" }; } },
  };
  await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.equal(smsCalled, true);
});

test("retrying a guest confirmation falls back to the public invite page since the private edit token cannot be recovered", async () => {
  let html = "";
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ({
      ...ownerFailedReservation,
      audience: "guest",
      channel: "email",
      kind: "guest_confirmation",
      recipient: "guest@example.com",
      eventSlug: "sample-event",
    }),
    getRsvpSnapshot: async () => rsvpSnapshot,
    markSent: async () => undefined,
    markFailed: notCalled("markFailed"),
    email: { send: async (input) => { html = input.html; return { ok: true, providerId: "e1" }; } },
    sms: { send: notCalled("sms.send") },
  };
  await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.doesNotMatch(html, /editToken/);
  assert.match(html, /original confirmation/);
  assert.match(html, /href="https:\/\/events\.example\.test\/invite\/sample-event"/);
});

test("a retry never strands the row in 'pending': a missing RSVP after reservation is marked failed", async () => {
  let failedArgs: [string, string] | null = null;
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ownerFailedReservation,
    getRsvpSnapshot: async () => null,
    markSent: notCalled("markSent"),
    markFailed: async (id, reason) => { failedArgs = [id, reason]; },
    email: { send: notCalled("email.send") },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: true, status: "failed" });
  assert.equal(failedArgs?.[0], "notif-1");
});

test("a retry never strands the row in 'pending': a provider throwing (not returning {ok:false}) is marked failed, not thrown", async () => {
  let failedArgs: [string, string] | null = null;
  const dependencies: RetryDependencies = {
    reserveRetry: async () => ownerFailedReservation,
    getRsvpSnapshot: async () => rsvpSnapshot,
    markSent: notCalled("markSent"),
    markFailed: async (id, reason) => { failedArgs = [id, reason]; },
    email: { send: async () => { throw new Error("resend timeout"); } },
    sms: { send: notCalled("sms.send") },
  };
  const result = await processInvitationNotificationRetry(
    { notificationId: "notif-1", origin: "https://events.example.test" },
    dependencies,
  );
  assert.deepEqual(result, { ok: true, status: "failed" });
  assert.deepEqual(failedArgs, ["notif-1", "resend timeout"]);
});
