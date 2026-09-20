import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibleBroadcastRecipients,
  parseComposeBroadcastInput,
} from "./broadcasts";
import { dispatchBroadcastNotifications } from "./broadcasts";
import { createInvitationBroadcast } from "./broadcasts";
import type { InvitationResponseRow } from "./responses";

function row(overrides: Partial<InvitationResponseRow>): InvitationResponseRow {
  return {
    id: "rsvp-1", event_id: "event-1", primary_name: "Wunmi Adeniji",
    email: null, phone: null, attending: true, party_size: 1,
    additional_guest_names: [], dietary_or_accessibility_notes: null, message: null,
    created_at: "2026-09-13T12:00:00.000Z", updated_at: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

test("email recipients are every RSVP with an email, regardless of attending status", () => {
  const rows = [
    row({ id: "r1", email: "a@example.test" }),
    row({ id: "r2", email: null, phone: "+15551234567" }),
    row({ id: "r3", email: "b@example.test", attending: false, party_size: 0 }),
  ];
  const recipients = eligibleBroadcastRecipients(rows, "email");
  assert.deepEqual(recipients.map((r) => r.rsvpId), ["r1", "r3"]);
  assert.equal(recipients[0]?.contact, "a@example.test");
});

test("sms recipients are every RSVP with a phone, regardless of attending status", () => {
  const rows = [
    row({ id: "r1", phone: "+15551234567" }),
    row({ id: "r2", phone: null, email: "a@example.test" }),
  ];
  const recipients = eligibleBroadcastRecipients(rows, "sms");
  assert.deepEqual(recipients.map((r) => r.rsvpId), ["r1"]);
});

test("compose input requires a non-empty body", () => {
  const result = parseComposeBroadcastInput({ channel: "email", subject: "Hi", body: "  " });
  assert.deepEqual(result, { ok: false, code: "body_required" });
});

test("compose input requires a subject for email but not for sms", () => {
  assert.deepEqual(
    parseComposeBroadcastInput({ channel: "email", subject: "  ", body: "Thanks!" }),
    { ok: false, code: "subject_required" },
  );
  const smsResult = parseComposeBroadcastInput({ channel: "sms", subject: "", body: "Thanks!" });
  assert.equal(smsResult.ok, true);
  if (smsResult.ok) assert.equal(smsResult.value.subject, null);
});

test("compose input rejects an unrecognized channel", () => {
  assert.deepEqual(
    parseComposeBroadcastInput({ channel: "fax", body: "Thanks!" }),
    { ok: false, code: "invalid_channel" },
  );
});

test("compose input rejects a body over 5000 characters", () => {
  const result = parseComposeBroadcastInput({ channel: "sms", body: "x".repeat(5001) });
  assert.deepEqual(result, { ok: false, code: "body_too_long" });
});

test("a recipient whose email provider call fails is counted as failed, not thrown", async () => {
  const marked: string[] = [];
  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "email",
      subject: "Thank you!", body: "We loved having you.", from: "hello@example.test",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "wunmi@example.test" }],
    },
    {
      reserve: async () => ({ id: "n1", allowed: true }),
      savePayload: async () => undefined,
      markSent: async () => { marked.push("sent"); },
      markFailed: async () => { marked.push("failed"); },
      email: { send: async () => ({ ok: false, error: "provider unavailable" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.deepEqual(result, { sentCount: 0, failedCount: 1, suppressedCount: 0 });
  assert.deepEqual(marked, ["failed"]);
});

test("a recipient blocked by the shared cap is counted as suppressed and never calls the provider", async () => {
  let calls = 0;
  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "sms",
      subject: null, body: "See you soon!", from: "+15550001111",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "+15551234567" }],
    },
    {
      reserve: async () => ({ id: "n1", allowed: false }),
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => { calls += 1; return { ok: true, providerId: "sms-1" }; } },
    },
  );
  assert.deepEqual(result, { sentCount: 0, failedCount: 0, suppressedCount: 1 });
  assert.equal(calls, 0);
});

test("every recipient's reservation carries the broadcast id, audience guest, and kind celebrant_broadcast", async () => {
  const seen: unknown[] = [];
  await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-9", channel: "email",
      subject: "Update", body: "Details changed.", from: "hello@example.test",
      recipients: [{ rsvpId: "r1", primaryName: "Wunmi", contact: "wunmi@example.test" }],
    },
    {
      reserve: async (channel, input) => { seen.push({ channel, input }); return { id: "n1", allowed: true }; },
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.deepEqual(seen, [{
    channel: "email",
    input: { eventId: "event-1", rsvpId: "r1", audience: "guest", recipient: "wunmi@example.test", kind: "celebrant_broadcast", broadcastId: "broadcast-9" },
  }]);
});

test("a hundred recipients all get processed even though they're batched", async () => {
  const recipients = Array.from({ length: 100 }, (_, i) => ({ rsvpId: `r${i}`, primaryName: `Guest ${i}`, contact: `guest${i}@example.test` }));
  let sendCalls = 0;
  const result = await dispatchBroadcastNotifications(
    { eventId: "event-1", broadcastId: "broadcast-1", channel: "email", subject: "Hi", body: "Hi all", from: "hello@example.test", recipients },
    {
      reserve: async () => ({ id: `n-${sendCalls}`, allowed: true }),
      savePayload: async () => undefined,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      email: { send: async () => { sendCalls += 1; return { ok: true, providerId: `e${sendCalls}` }; } },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );
  assert.equal(result.sentCount, 100);
  assert.equal(sendCalls, 100);
});

test("a reservation that throws for one recipient does not abort siblings in the same batch or any later batch", async () => {
  const recipients = Array.from({ length: 20 }, (_, i) => ({
    rsvpId: `r${i}`,
    primaryName: `Guest ${i}`,
    contact: `guest${i}@example.test`,
  }));
  const reserveAttempts: string[] = [];
  const sentIds: string[] = [];

  // r9 falls inside the second batch of 8 (r8..r15) — a realistic position
  // to prove that a mid-batch throw doesn't stop the rest of that batch,
  // and that a later batch (r16..r19) is still attempted at all.
  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "email",
      subject: "Hi", body: "Hi all", from: "hello@example.test",
      recipients,
    },
    {
      reserve: async (_channel, input) => {
        reserveAttempts.push(input.rsvpId);
        if (input.rsvpId === "r9") {
          throw new Error("simulated Supabase/RPC failure");
        }
        return { id: `n-${input.rsvpId}`, allowed: true };
      },
      savePayload: async () => undefined,
      markSent: async (id) => { sentIds.push(id); },
      markFailed: async () => undefined,
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );

  // The function must resolve with accurate counts, not reject — a thrown
  // reservation for one recipient is a per-recipient failure, not a fatal
  // error for the whole dispatch.
  assert.deepEqual(result, { sentCount: 19, failedCount: 1, suppressedCount: 0 });

  // Every recipient in every batch — including the rest of r9's own batch
  // and the entire later batch (r16..r19) — got a reservation attempt.
  // An uncaught throw inside Promise.all would have rejected the whole
  // batch's Promise.all, aborting the dispatch loop before later batches
  // were ever reached.
  assert.equal(reserveAttempts.length, 20);
  assert.deepEqual(new Set(reserveAttempts), new Set(recipients.map((r) => r.rsvpId)));

  // Every recipient except r9 was actually sent, and that outcome is
  // reflected in the function's returned result rather than lost to a
  // detached background task racing an already-rejected promise.
  assert.equal(sentIds.length, 19);
  assert.ok(!sentIds.includes("n-r9"));
});

test("a markFailed throw on the failure path does not abort the batch or the whole dispatch", async () => {
  // 20 recipients spans three batches of 8 (r0..r7, r8..r15, r16..r19).
  // r9's provider send fails (a realistic case: provider rejects one
  // recipient), and this fake markFailed additionally throws for that one
  // notification id — simulating the same class of Supabase/RPC error that
  // reserve() can throw, but one level deeper in sendToRecipient. Before
  // the fix, the else-branch's markFailed throw fell into the outer catch,
  // which called markFailed a second time; that second call is not wrapped
  // in anything and its throw escaped sendToRecipient entirely, rejecting
  // Promise.all for r9's whole batch and aborting the dispatch loop before
  // the third batch (r16..r19) was ever attempted.
  const recipients = Array.from({ length: 20 }, (_, i) => ({
    rsvpId: `r${i}`,
    primaryName: `Guest ${i}`,
    contact: `guest${i}@example.test`,
  }));
  const reserveAttempts: string[] = [];
  const markFailedAttempts: string[] = [];
  const sentIds: string[] = [];

  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "email",
      subject: "Hi", body: "Hi all", from: "hello@example.test",
      recipients,
    },
    {
      reserve: async (_channel, input) => {
        reserveAttempts.push(input.rsvpId);
        return { id: `n-${input.rsvpId}`, allowed: true };
      },
      savePayload: async () => undefined,
      markSent: async (id) => { sentIds.push(id); },
      markFailed: async (id) => {
        markFailedAttempts.push(id);
        if (id === "n-r9") throw new Error("simulated Supabase/RPC failure recording the failure");
      },
      email: {
        send: async (input) => input.to === "guest9@example.test"
          ? { ok: false, error: "provider rejected this recipient" }
          : { ok: true, providerId: "e1" },
      },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );

  // The function must resolve with accurate counts, not reject.
  assert.deepEqual(result, { sentCount: 19, failedCount: 1, suppressedCount: 0 });

  // Every recipient in every batch — including the rest of r9's own batch
  // and the entire third batch (r16..r19) — got a reservation attempt.
  assert.equal(reserveAttempts.length, 20);
  assert.deepEqual(new Set(reserveAttempts), new Set(recipients.map((r) => r.rsvpId)));

  // markFailed was attempted for r9 (and only r9) despite throwing.
  assert.deepEqual(markFailedAttempts, ["n-r9"]);

  // Every recipient except r9 was actually sent, and that outcome is
  // reflected in the function's returned result.
  assert.equal(sentIds.length, 19);
  assert.ok(!sentIds.includes("n-r9"));
});

test("a markSent throw for a successful send is counted as failed exactly once, never also as sent", async () => {
  // Before the fix, sentCount was incremented BEFORE awaiting markSent, so
  // a markSent throw fell into the catch block and incremented failedCount
  // too — double-counting this recipient (sentCount + failedCount would
  // exceed the recipient total) and mislabeling a message that was
  // actually delivered as "failed" in the database.
  const recipients = Array.from({ length: 5 }, (_, i) => ({
    rsvpId: `r${i}`,
    primaryName: `Guest ${i}`,
    contact: `guest${i}@example.test`,
  }));
  const markSentAttempts: string[] = [];
  const markFailedAttempts: string[] = [];

  const result = await dispatchBroadcastNotifications(
    {
      eventId: "event-1", broadcastId: "broadcast-1", channel: "email",
      subject: "Hi", body: "Hi all", from: "hello@example.test",
      recipients,
    },
    {
      reserve: async (_channel, input) => ({ id: `n-${input.rsvpId}`, allowed: true }),
      savePayload: async () => undefined,
      markSent: async (id) => {
        markSentAttempts.push(id);
        if (id === "n-r2") throw new Error("simulated DB write failure recording sent status");
      },
      markFailed: async (id) => { markFailedAttempts.push(id); },
      email: { send: async () => ({ ok: true, providerId: "e1" }) },
      sms: { send: async () => ({ ok: true, providerId: "sms-1" }) },
    },
  );

  // r2's provider send succeeded but the DB write recording that failed —
  // this must count as exactly one outcome (failed), never both sentCount
  // and failedCount for the same recipient.
  assert.deepEqual(result, { sentCount: 4, failedCount: 1, suppressedCount: 0 });
  assert.equal(result.sentCount + result.failedCount + result.suppressedCount, recipients.length);
  assert.deepEqual(markFailedAttempts, ["n-r2"]);
});

test("createInvitationBroadcast rejects an empty body before touching the database", async () => {
  await assert.rejects(
    () => createInvitationBroadcast({ eventId: "event-1", channel: "email", subject: "Hi", body: "", sentBy: "owner" }),
    /body/i,
  );
});
