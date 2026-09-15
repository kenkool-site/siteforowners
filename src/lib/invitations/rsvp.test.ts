import assert from "node:assert/strict";
import test from "node:test";
import {
  capacityDelta,
  canMutateRsvp,
  createInvitationRsvpRateLimiter,
  mapRsvpRpcError,
  processPublicRsvpRequest,
  submitRsvp,
  type SubmitRsvpRpcInput,
} from "./rsvp";

test("an increase consumes only the additional seats", () => {
  assert.equal(capacityDelta({ oldAttending: true, oldPartySize: 2, attending: true, partySize: 4 }), 2);
});

test("a decline frees the previous party", () => {
  assert.equal(capacityDelta({ oldAttending: true, oldPartySize: 3, attending: false, partySize: 0 }), -3);
});

test("closed events allow token-authenticated edits but not creates", () => {
  assert.equal(canMutateRsvp("rsvp_closed", "create"), false);
  assert.equal(canMutateRsvp("rsvp_closed", "update"), true);
  for (const state of ["draft", "expired", "offline"] as const) {
    assert.equal(canMutateRsvp(state, "create"), false);
    assert.equal(canMutateRsvp(state, "update"), false);
  }
});

test("stable database exception codes map without parsing provider prose", () => {
  assert.equal(mapRsvpRpcError({ message: "INVITE_CAPACITY_REACHED" }), "capacity_reached");
  assert.equal(mapRsvpRpcError({ message: "prefix INVITE_CAPACITY_REACHED suffix" }), "event_unavailable");
  assert.equal(mapRsvpRpcError({ message: "INVITE_INVALID_EDIT_TOKEN" }), "invalid_edit_token");
  assert.equal(mapRsvpRpcError({ message: "INVITE_CONTACT_CONFLICT" }), "contact_conflict");
  assert.equal(mapRsvpRpcError({ code: "PGRST500", message: "database offline" }), "event_unavailable");
});

test("the RSVP limiter uses one serialized event-and-IP attempt and fails closed", async () => {
  const calls: Array<{ eventId: string; ipHash: string; windowSeconds: number; maxAttempts: number }> = [];
  const allowed = createInvitationRsvpRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
  });
  assert.equal(await allowed.allowAttempt("event-1", "a".repeat(64)), true);
  assert.deepEqual(calls, [{ eventId: "event-1", ipHash: "a".repeat(64), windowSeconds: 600, maxAttempts: 20 }]);

  const unavailable = createInvitationRsvpRateLimiter({
    attempt: async () => ({ data: null, error: new Error("database unavailable") }),
  });
  assert.equal(await unavailable.allowAttempt("event-1", "a".repeat(64)), false);
});

const normalizedInput = {
  primaryName: "Ana",
  email: "ana@example.com",
  phone: null,
  attending: true,
  partySize: 2,
  additionalGuestNames: ["Luis"],
  dietaryOrAccessibilityNotes: null,
  message: "See you there",
};

test("create stores only a generated edit-token hash and returns plaintext once", async () => {
  const calls: SubmitRsvpRpcInput[] = [];
  const result = await submitRsvp(
    { eventId: "event-1", input: normalizedInput },
    {
      createToken: () => ({ token: "private-token", hash: "stored-hash" }),
      hashToken: () => { throw new Error("update hashing must not run"); },
      mutate: async (input) => {
        calls.push(input);
        return {
          data: [{ rsvp_id: "rsvp-1", mutation_kind: "created", attending_total: 2, declined_party_total: 0, remaining_capacity: 8 }],
          error: null,
        };
      },
    },
  );

  assert.equal(calls[0]?.editTokenHash, "stored-hash");
  assert.equal(calls[0]?.existingRsvpId, null);
  assert.equal(result.ok && result.value.editToken, "private-token");
  assert.equal(result.ok && result.value.created, true);
});

test("update hashes the supplied credential and never returns it", async () => {
  const calls: SubmitRsvpRpcInput[] = [];
  const result = await submitRsvp(
    { eventId: "event-1", rsvpId: "rsvp-1", editToken: "private-token", input: normalizedInput },
    {
      createToken: () => { throw new Error("create token must not run"); },
      hashToken: (token) => `hashed:${token}`,
      mutate: async (input) => {
        calls.push(input);
        return {
          data: [{ rsvp_id: "rsvp-1", mutation_kind: "updated", attending_total: 2, declined_party_total: 0, remaining_capacity: null }],
          error: null,
        };
      },
    },
  );

  assert.equal(calls[0]?.editTokenHash, "hashed:private-token");
  assert.equal(calls[0]?.existingRsvpId, "rsvp-1");
  assert.equal(result.ok && result.value.editToken, null);
  assert.equal(result.ok && result.value.created, false);
});

test("an identical contact submission returns unchanged without exposing a fresh credential", async () => {
  const result = await submitRsvp(
    { eventId: "event-1", input: normalizedInput },
    {
      createToken: () => ({ token: "unused-new-token", hash: "unused-new-hash" }),
      hashToken: () => { throw new Error("must not hash"); },
      mutate: async () => ({
        data: [{ rsvp_id: "rsvp-1", mutation_kind: "unchanged", attending_total: 2, declined_party_total: 0, remaining_capacity: 8 }],
        error: null,
      }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.outcome, "unchanged");
  assert.equal(result.ok && result.value.created, false);
  assert.equal(result.ok && result.value.editToken, null);
});

test("administrative updates explicitly bypass guest tokens without creating responses", async () => {
  const calls: SubmitRsvpRpcInput[] = [];
  const result = await submitRsvp(
    {
      eventId: "event-1",
      rsvpId: "rsvp-1",
      credentialMode: "administrative",
      input: normalizedInput,
    },
    {
      createToken: () => { throw new Error("administrative updates must not create tokens"); },
      hashToken: () => { throw new Error("administrative updates must not hash guest tokens"); },
      mutate: async (input) => {
        calls.push(input);
        return {
          data: [{ rsvp_id: "rsvp-1", mutation_kind: "updated", attending_total: 2, declined_party_total: 0, remaining_capacity: 8 }],
          error: null,
        };
      },
    },
  );

  assert.equal(calls[0]?.administrative, true);
  assert.equal(calls[0]?.existingRsvpId, "rsvp-1");
  assert.equal(calls[0]?.editTokenHash, "");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.editToken, null);

  assert.deepEqual(
    await submitRsvp(
      { eventId: "event-1", credentialMode: "administrative", input: normalizedInput },
      {
        createToken: () => { throw new Error("must not create"); },
        hashToken: () => { throw new Error("must not hash"); },
        mutate: async () => { throw new Error("must not mutate"); },
      },
    ),
    { ok: false, code: "invalid_edit_token" },
  );
});

test("an update requires both RSVP ID and edit token", async () => {
  const dependencies = {
    createToken: () => ({ token: "private-token", hash: "stored-hash" }),
    hashToken: (token: string) => token,
    mutate: async () => { throw new Error("RPC must not run"); },
  };
  assert.deepEqual(
    await submitRsvp({ eventId: "event-1", rsvpId: "rsvp-1", input: normalizedInput }, dependencies),
    { ok: false, code: "invalid_edit_token" },
  );
  assert.deepEqual(
    await submitRsvp({ eventId: "event-1", editToken: "private-token", input: normalizedInput }, dependencies),
    { ok: false, code: "invalid_edit_token" },
  );
});

const publishedEvent = {
  event: {
    id: "event-1",
    slug: "Mia-And-Lee",
    status: "published" as const,
    rsvpDeadline: null,
    expireAt: null,
    showPublicRsvpCount: false,
  },
  passcodeHash: null,
};

const validBody = {
  slug: "Mia-And-Lee",
  rsvp: {
    primaryName: "Ana",
    email: "ana@example.com",
    attending: true,
    partySize: 2,
    additionalGuestNames: ["Luis"],
  },
};

test("public RSVP processing uses the exact slug and redacts disabled aggregates", async () => {
  const lookedUp: string[] = [];
  const result = await processPublicRsvpRequest(
    { body: validBody, ipHash: "a".repeat(64), readPasscodeCookie: () => null, origin: "https://events.example.test", now: new Date("2026-01-01") },
    {
      findInvitation: async (slug) => { lookedUp.push(slug); return publishedEvent; },
      verifyPasscode: () => false,
      allowAttempt: async () => true,
      submit: async () => ({
        ok: true,
        value: {
          rsvp: { id: "rsvp-1", eventId: "event-1", ...normalizedInput },
          rsvpId: "rsvp-1",
          created: true,
          outcome: "created",
          attendingTotal: 99,
          declinedPartyTotal: 20,
          remainingCapacity: 1,
          editToken: "secret-token",
        },
      }),
    },
  );

  assert.deepEqual(lookedUp, ["Mia-And-Lee"]);
  assert.equal(result.status, 200);
  assert.equal("summary" in result.body, false);
  assert.equal(result.body.outcome, "created");
  assert.equal("editUrl" in result.body, false);
  assert.doesNotMatch(JSON.stringify(result.body), /99|20/);
});

test("a protected RSVP requires its event-scoped passcode session before rate limit or mutation", async () => {
  let attempted = false;
  let submitted = false;
  const result = await processPublicRsvpRequest(
    { body: validBody, ipHash: "a".repeat(64), readPasscodeCookie: () => "wrong-session", origin: "https://events.example.test", now: new Date("2026-01-01") },
    {
      findInvitation: async () => ({ ...publishedEvent, passcodeHash: "stored-hash" }),
      verifyPasscode: () => false,
      allowAttempt: async () => { attempted = true; return true; },
      submit: async () => { submitted = true; throw new Error("must not submit"); },
    },
  );
  assert.deepEqual(result, { status: 403, body: { ok: false, code: "event_unavailable" } });
  assert.equal(attempted, false);
  assert.equal(submitted, false);
});

test("offline and expired events disclose nothing and a limiter failure rejects safely", async () => {
  for (const status of ["offline", "expired"] as const) {
    const result = await processPublicRsvpRequest(
      { body: validBody, ipHash: "a".repeat(64), readPasscodeCookie: () => null, origin: "https://events.example.test", now: new Date("2026-01-01") },
      {
        findInvitation: async () => ({ ...publishedEvent, event: { ...publishedEvent.event, status } }),
        verifyPasscode: () => true,
        allowAttempt: async () => { throw new Error("must not rate limit unavailable events"); },
        submit: async () => { throw new Error("must not submit"); },
      },
    );
    assert.deepEqual(result, { status: 404, body: { ok: false, code: "event_unavailable" } });
  }

  const limited = await processPublicRsvpRequest(
    { body: validBody, ipHash: "a".repeat(64), readPasscodeCookie: () => null, origin: "https://events.example.test", now: new Date("2026-01-01") },
    {
      findInvitation: async () => publishedEvent,
      verifyPasscode: () => true,
      allowAttempt: async () => false,
      submit: async () => { throw new Error("must not submit"); },
    },
  );
  assert.deepEqual(limited, { status: 429, body: { ok: false, code: "rate_limited" } });
});
