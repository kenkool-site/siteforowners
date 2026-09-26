import assert from "node:assert/strict";
import test from "node:test";
import { createFindMeRateLimiter } from "./find-me-rate-limit";

test("the find-me limiter fails closed when its serialized RPC is unavailable", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: null, error: new Error("database unavailable") }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), false);
});

test("the find-me limiter delegates one event-and-session attempt to its RPC, with a 24-hour/5-attempt window", async () => {
  const calls: Array<{ eventId: string; guestSessionId: string; windowSeconds: number; maxAttempts: number }> = [];
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), true);
  assert.deepEqual(calls, [{ eventId: "event-1", guestSessionId: "session-1", windowSeconds: 86400, maxAttempts: 5 }]);
});

test("the find-me limiter denies the attempt when the RPC itself says no", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: false, error: null }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), false);
});
