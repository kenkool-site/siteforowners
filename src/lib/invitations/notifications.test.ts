import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchRsvpNotifications,
  notificationInvitationUrl,
  processInvitationNotificationRetry,
  type DispatchRsvpNotificationsInput,
  type NotificationDispatchDependencies,
  type NotificationEventContext,
  type RetryDependencies,
  type RetryReservation,
} from "./notifications";
import type { RsvpMutationResult } from "./types";

const baseEvent: NotificationEventContext = {
  id: "event-1",
  slug: "sample-event",
  title: "Sample Wedding",
  locale: "en",
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

test("notification invitation links prefer the event subdomain and retain the legacy fallback", () => {
  assert.equal(
    notificationInvitationUrl({ ...baseEvent, publicSubdomain: "sample-wedding" }, "https://www.siteforowners.com"),
    "https://sample-wedding.siteforowners.com/",
  );
  assert.equal(
    notificationInvitationUrl(baseEvent, "https://www.siteforowners.com"),
    "https://www.siteforowners.com/invite/sample-event",
  );
});

function alwaysAllow(): NotificationDispatchDependencies {
  return {
    savePayload: async () => undefined,
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async () => undefined,
    email: { send: async () => ({ ok: true, providerId: "e1" }) },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  };
}

test("dispatch persists the exact payload before delivery and retry ignores mutable RSVP, locale, origin and sender", async () => {
  const saved = new Map<string, string>();
  const sent: string[] = [];
  const email = { send: async (input: import("./notifications").EmailSendInput) => {
    assert.equal(saved.has(input.idempotencyKey), true);
    sent.push(JSON.stringify(input));
    return { ok: false as const, error: "down" };
  } };
  await dispatchRsvpNotifications({ ...fixture, event: { ...baseEvent, locale: "es", ownerEmailNotifications: false, guestEmailConfirmations: true } }, {
    ...alwaysAllow(), email,
    savePayload: async (id, payload) => { saved.set(id, JSON.stringify(payload)); },
  });
  const original = sent[0];
  assert.ok(original?.includes("editToken=secret"));
  await processInvitationNotificationRetry({ notificationId: "n-email", origin: "https://changed.invalid" }, {
    reserveRetry: async () => ({ ...ownerFailedReservation, recipient: "guest@example.com", audience: "guest", kind: "guest_confirmation", eventTitle: "Changed", eventLocale: "en" }),
    loadPayload: async (id) => JSON.parse(saved.get(id)!),
    email, sms: { send: notCalled("sms") }, markSent: async () => undefined, markFailed: async () => undefined,
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[1], original);
});

test("no provider call occurs if the original payload cannot be durably saved", async () => {
  let calls = 0;
  const result = await dispatchRsvpNotifications(fixture, {
    ...alwaysAllow(), savePayload: async () => { throw new Error("database unavailable"); },
    email: { send: async () => { calls += 1; return { ok: true, providerId: "id" }; } },
  });
  assert.equal(calls, 0);
  assert.equal(result.notificationsDelayed, true);
});

test("RSVP remains successful when owner email fails", async () => {
  const stored: string[] = [];
  const result = await dispatchRsvpNotifications(fixture, {
    savePayload: async () => undefined,
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
    savePayload: async () => undefined,
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
    savePayload: async () => undefined,
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
    savePayload: async () => undefined,
    reserve: async (channel) => ({ id: `n-${channel}`, allowed: true }),
    markSent: async () => undefined,
    markFailed: async (id, reason) => { failed.push({ id, reason }); },
    email: { send: async () => { throw new Error("network blip"); } },
    sms: { send: async () => ({ ok: true, providerId: "s1" }) },
  });
  assert.deepEqual(failed, [{ id: "n-email", reason: "Notification delivery failed" }]);
  assert.equal(result.notificationsDelayed, true);
});

test("guest confirmation is only attempted when enabled and the guest has an email", async () => {
  async function plannedAttempts(input: DispatchRsvpNotificationsInput) {
    const calls: Array<{ channel: string; audience: string; kind: string }> = [];
    await dispatchRsvpNotifications(input, {
      savePayload: async () => undefined,
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
    savePayload: async () => undefined,
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
    savePayload: async () => undefined,
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
      savePayload: async () => undefined,
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
      savePayload: async () => undefined,
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
      savePayload: async () => undefined,
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
// Locale awareness — invitation_events.locale drives the owner/guest
// notification content, mirroring the public invite page's per-event
// locale (see InvitationPublicProvider). Event-authored fields (title,
// primary name, notes, message) are exempt and render exactly as entered.
// ---------------------------------------------------------------------------

test("a Spanish-locale event renders the owner notification email and subject in Spanish", async () => {
  let subject = "";
  let html = "";
  await dispatchRsvpNotifications(
    { ...fixture, event: { ...baseEvent, locale: "es" } },
    {
      savePayload: async () => undefined,
      reserve: async () => ({ id: "n-email", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { subject = input.subject; html = input.html; return { ok: true, providerId: "e1" }; } },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.match(subject, /^Nuevo RSVP — Sample Wedding$/);
  assert.match(html, /Contacto:/);
  assert.match(html, /grupo de 2/);
  assert.match(html, /Ver en su panel/);
  assert.doesNotMatch(html, /Contact:|party of|View in your dashboard/);
});

test("a Spanish-locale declined RSVP appends the Spanish declined suffix and owner SMS body", async () => {
  let subject = "";
  let smsBody = "";
  await dispatchRsvpNotifications(
    {
      ...smsFixture,
      event: { ...smsFixture.event, locale: "es", ownerEmailNotifications: true, notificationEmail: "owner@example.com" },
      rsvp: { ...baseRsvp, attending: false },
    },
    {
      savePayload: async () => undefined,
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { subject = input.subject; return { ok: true, providerId: "e1" }; } },
      sms: { send: async (input) => { smsBody = input.body; return { ok: true, providerId: "s1" }; } },
    },
  );
  assert.match(subject, /^Nuevo RSVP — No asistirá — Sample Wedding$/);
  assert.match(smsBody, /No asistirá/);
  assert.doesNotMatch(smsBody, /Declined/);
});

test("a Spanish-locale event renders the guest confirmation email in Spanish", async () => {
  let html = "";
  let subject = "";
  await dispatchRsvpNotifications(
    { ...fixture, event: { ...baseEvent, locale: "es", guestEmailConfirmations: true } },
    {
      savePayload: async () => undefined,
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: {
        send: async (input) => {
          if (input.subject.startsWith("Su RSVP")) { subject = input.subject; html = input.html; }
          return { ok: true, providerId: "e1" };
        },
      },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.match(subject, /^Su RSVP para Sample Wedding$/);
  assert.match(html, /¡Gracias, Jamie Guest!/);
  assert.match(html, /Actualizar su RSVP/);
  assert.doesNotMatch(html, /Thanks,|Update your RSVP/);
});

test("a Spanish-locale guest confirmation without an edit link falls back to the Spanish invitation-page text", async () => {
  let html = "";
  await dispatchRsvpNotifications(
    { ...fixture, created: false, editUrl: null, event: { ...baseEvent, locale: "es", guestEmailConfirmations: true } },
    {
      savePayload: async () => undefined,
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: {
        send: async (input) => {
          if (input.subject.startsWith("Su RSVP")) html = input.html;
          return { ok: true, providerId: "e1" };
        },
      },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.match(html, /confirmación original/);
  assert.match(html, /la página de la invitación/);
  assert.doesNotMatch(html, /original confirmation|the invitation page/);
});

test("event-authored fields (title, primary name) render as entered regardless of locale", async () => {
  let html = "";
  const authoredRsvp: RsvpMutationResult["rsvp"] = { ...baseRsvp, primaryName: "María José" };
  await dispatchRsvpNotifications(
    {
      ...fixture,
      rsvp: authoredRsvp,
      event: { ...baseEvent, locale: "es", title: "Boda de Ana y Luis" },
    },
    {
      savePayload: async () => undefined,
      reserve: async () => ({ id: "n", allowed: true }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async (input) => { html = input.html; return { ok: true, providerId: "e1" }; } },
      sms: { send: async () => ({ ok: true, providerId: "s1" }) },
    },
  );
  assert.match(html, /Boda de Ana y Luis/);
  assert.match(html, /María José/);
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
  eventLocale: "en",
  rsvpId: "rsvp-1",
  audience: "owner",
  channel: "email",
  recipient: "owner@example.com",
  kind: "rsvp_created",
};

for (const code of ["not_found", "limit_reached"] as const) {
  test(`retry stops before reading private payload for ${code}`, async () => {
    assert.deepEqual(await processInvitationNotificationRetry({ notificationId: "n", origin: "https://example.test" }, {
      reserveRetry: async () => ({ allowed: false, code }), loadPayload: notCalled("loadPayload"),
      markSent: notCalled("markSent"), markFailed: notCalled("markFailed"),
      email: { send: notCalled("email") }, sms: { send: notCalled("sms") },
    }), { ok: false, code });
  });
}

for (const scenario of ["email", "sms", "missing", "corrupt", "throws", "provider_failure"] as const) {
  test(`retry finalizes pending reservation safely: ${scenario}`, async () => {
    let status = "";
    let calls = 0;
    const channel = scenario === "sms" ? "sms" : "email";
    const input = { from: "original@example.com", to: "owner@example.com", idempotencyKey: "notif-1" };
    const dependencies: RetryDependencies = {
      reserveRetry: async () => ({ ...ownerFailedReservation, channel }),
      loadPayload: async () => {
        if (scenario === "missing") return null;
        if (scenario === "corrupt") throw new Error("unrecoverable");
        return channel === "sms" ? { channel, input: { ...input, body: "Original SMS" } }
          : { channel, input: { ...input, subject: "Original subject", html: "<p>Original body</p>" } };
      },
      markSent: async () => { status = "sent"; },
      markFailed: async (_id, reason) => { status = "failed"; assert.equal(reason, "Notification delivery failed"); },
      email: { send: async (payload) => {
        calls++;
        assert.equal(payload.from, "original@example.com");
        assert.equal(payload.idempotencyKey, "notif-1");
        if (scenario === "throws") throw new Error("Private provider echo");
        return scenario === "provider_failure" ? { ok: false, error: "private content" } : { ok: true, providerId: "email" };
      } },
      sms: { send: async (payload) => { calls++; assert.equal(payload.body, "Original SMS"); return { ok: true, providerId: "sms" }; } },
    };
    await processInvitationNotificationRetry({ notificationId: "notif-1", origin: "https://changed.test" }, dependencies);
    assert.equal(status, scenario === "email" || scenario === "sms" ? "sent" : "failed");
    assert.equal(calls, scenario === "missing" || scenario === "corrupt" ? 0 : 1);
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// messages/en.json and messages/es.json must define exactly the same set of
// keys under invitations.notifications — the plain-object lookup in
// notifications.ts has no fallback, so a key present in only one locale
// would silently render "undefined" in the other.
// ---------------------------------------------------------------------------

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("messages/en.json and messages/es.json define the same invitations.notifications keys", async () => {
  const en = (await import("../../../messages/en.json")).default;
  const es = (await import("../../../messages/es.json")).default;
  const enKeys = collectKeyPaths(en.invitations.notifications).sort();
  const esKeys = collectKeyPaths(es.invitations.notifications).sort();
  assert.deepEqual(esKeys, enKeys);
});
