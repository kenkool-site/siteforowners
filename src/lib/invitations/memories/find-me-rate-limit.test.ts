import assert from "node:assert/strict";
import test from "node:test";
import { createFindMeRateLimiter } from "./find-me-rate-limit";

// An RPC failure must be distinguishable from a genuine denial — see the
// "error" outcome's own doc comment in find-me-rate-limit.ts. Previously
// both collapsed to `false`, which made a transient DB hiccup indistinguishable
// from a guest's 5th-strike-and-out.
test("the find-me limiter reports 'error' (not 'denied') when its RPC fails", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: null, error: new Error("database unavailable") }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "error");
});

test("the find-me limiter reports 'error' (not 'denied') when the RPC call itself throws", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => {
      throw new Error("connection reset");
    },
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "error");
});

test("the find-me limiter delegates one event-and-session attempt to its RPC, with a 24-hour/20-attempt window", async () => {
  const calls: Array<{ eventId: string; guestSessionId: string; windowSeconds: number; maxAttempts: number }> = [];
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "allowed");
  assert.deepEqual(calls, [{ eventId: "event-1", guestSessionId: "session-1", windowSeconds: 86400, maxAttempts: 20 }]);
});

test("the find-me limiter reports 'denied' when the RPC itself says no", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: false, error: null }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "denied");
});
