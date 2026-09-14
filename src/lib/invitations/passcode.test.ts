import assert from "node:assert/strict";
import test from "node:test";
import { attemptInvitationPasscode } from "./passcode";

test("passcode attempts use one event-and-hashed-IP bucket without leaking credentials", async () => {
  const buckets: string[] = [];
  const result = await attemptInvitationPasscode(
    { eventId: "event-1", passcode: "orchid", storedHash: "stored", ip: "203.0.113.17" },
    {
      allowAttempt: async (bucket) => {
        buckets.push(bucket);
        return true;
      },
      verifyPasscode: async (passcode, hash) => passcode === "orchid" && hash === "stored",
    },
  );

  assert.equal(result, "success");
  assert.equal(buckets.length, 1);
  assert.match(buckets[0] ?? "", /^invitation_passcode:event-1:[a-f0-9]{64}$/);
  assert.doesNotMatch(buckets[0] ?? "", /orchid|203\.0\.113\.17/);
});

test("an exhausted passcode bucket blocks verification", async () => {
  let verified = false;
  const result = await attemptInvitationPasscode(
    { eventId: "event-1", passcode: "orchid", storedHash: "stored", ip: "203.0.113.17" },
    {
      allowAttempt: async () => false,
      verifyPasscode: async () => {
        verified = true;
        return true;
      },
    },
  );

  assert.equal(result, "rate_limited");
  assert.equal(verified, false);
});

test("incorrect and malformed passcodes fail without exposing a distinct response", async () => {
  const dependency = {
    allowAttempt: async () => true,
    verifyPasscode: async () => false,
  };
  assert.equal(
    await attemptInvitationPasscode(
      { eventId: "event-1", passcode: "wrong", storedHash: "stored", ip: "203.0.113.17" },
      dependency,
    ),
    "invalid",
  );
  assert.equal(
    await attemptInvitationPasscode(
      { eventId: "event-1", passcode: "", storedHash: "stored", ip: "203.0.113.17" },
      dependency,
    ),
    "invalid",
  );
});
