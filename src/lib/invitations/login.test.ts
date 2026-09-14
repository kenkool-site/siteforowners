import assert from "node:assert/strict";
import test from "node:test";
import {
  INVITATION_OWNER_DUMMY_PIN_HASH,
  attemptInvitationOwnerLogin,
  type InvitationLoginDependencies,
} from "./login";

function dependencies(overrides: Partial<InvitationLoginDependencies> = {}): InvitationLoginDependencies {
  return {
    findActiveOwner: async () => ({ id: "owner-1", pinHash: "owner-hash" }),
    verifyPin: async () => true,
    rateLimiter: {
      canAttempt: async () => true,
      recordFailure: async () => true,
    },
    ...overrides,
  };
}

test("a successful login normalizes its email without recording a failure", async () => {
  const emails: string[] = [];
  let recorded = 0;
  const result = await attemptInvitationOwnerLogin(
    { email: " Ana@Example.com ", pin: "1234", ip: "203.0.113.10" },
    dependencies({
      findActiveOwner: async (email) => {
        emails.push(email);
        return { id: "owner-1", pinHash: "owner-hash" };
      },
      rateLimiter: {
        canAttempt: async () => true,
        recordFailure: async () => {
          recorded += 1;
          return true;
        },
      },
    }),
  );

  assert.deepEqual(result, { kind: "success", ownerId: "owner-1" });
  assert.deepEqual(emails, ["ana@example.com"]);
  assert.equal(recorded, 0);
});

test("a bad PIN records one failure in both login buckets", async () => {
  const recorded: string[] = [];
  const result = await attemptInvitationOwnerLogin(
    { email: "ana@example.com", pin: "1234", ip: "203.0.113.10" },
    dependencies({
      verifyPin: async () => false,
      rateLimiter: {
        canAttempt: async () => true,
        recordFailure: async (bucket) => {
          recorded.push(bucket);
          return true;
        },
      },
    }),
  );

  assert.deepEqual(result, { kind: "invalid" });
  assert.equal(recorded.length, 2);
  assert.ok(recorded.every((bucket) => bucket.startsWith("invitation_owner_login:")));
});

test("an unknown owner runs one valid-cost dummy PIN verification", async () => {
  const pinHashes: string[] = [];
  const result = await attemptInvitationOwnerLogin(
    { email: "missing@example.com", pin: "1234", ip: "203.0.113.10" },
    dependencies({
      findActiveOwner: async () => null,
      verifyPin: async (_pin, hash) => {
        pinHashes.push(hash);
        return false;
      },
    }),
  );

  assert.deepEqual(result, { kind: "invalid" });
  assert.deepEqual(pinHashes, [INVITATION_OWNER_DUMMY_PIN_HASH]);
});

test("a pre-verification rate limit prevents an owner lookup", async () => {
  let lookedUp = false;
  const result = await attemptInvitationOwnerLogin(
    { email: "ana@example.com", pin: "1234", ip: "203.0.113.10" },
    dependencies({
      findActiveOwner: async () => {
        lookedUp = true;
        return null;
      },
      rateLimiter: {
        canAttempt: async () => false,
        recordFailure: async () => true,
      },
    }),
  );

  assert.deepEqual(result, { kind: "rate_limited" });
  assert.equal(lookedUp, false);
});
