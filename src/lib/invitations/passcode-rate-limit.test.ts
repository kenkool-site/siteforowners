import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationPasscodeRateLimiter } from "./passcode-rate-limit";

test("the invitation passcode limiter fails closed when its serialized RPC is unavailable", async () => {
  const limiter = createInvitationPasscodeRateLimiter({
    attempt: async () => ({ data: null, error: new Error("database unavailable") }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "a".repeat(64)), false);
});

test("the invitation passcode limiter delegates one event-and-hash attempt to its RPC", async () => {
  const calls: Array<{ eventId: string; ipHash: string; windowSeconds: number; maxAttempts: number }> = [];
  const limiter = createInvitationPasscodeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
  });

  assert.equal(await limiter.allowAttempt("event-1", "a".repeat(64)), true);
  assert.deepEqual(calls, [{ eventId: "event-1", ipHash: "a".repeat(64), windowSeconds: 3600, maxAttempts: 10 }]);
});
