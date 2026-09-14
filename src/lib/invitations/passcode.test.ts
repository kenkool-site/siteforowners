import assert from "node:assert/strict";
import test from "node:test";
import { attemptInvitationPasscode } from "./passcode";

test("passcode attempts give the serialized limiter an event ID and hashed IP without leaking credentials", async () => {
  const limiterInputs: string[][] = [];
  const result = await attemptInvitationPasscode(
    { eventId: "event-1", passcode: "orchid", storedHash: "stored", ip: "203.0.113.17" },
    {
      allowAttempt: async (...parts) => {
        limiterInputs.push(parts);
        return true;
      },
      verifyPasscode: async (passcode, hash) => passcode === "orchid" && hash === "stored",
    },
  );

  assert.equal(result, "success");
  assert.deepEqual(limiterInputs.map((parts) => parts[0]), ["event-1"]);
  assert.match(limiterInputs[0]?.[1] ?? "", /^[a-f0-9]{64}$/);
  assert.doesNotMatch(limiterInputs.flat().join(":"), /orchid|203\.0\.113\.17/);
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
