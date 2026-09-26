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
    getDailyLimit: async () => 20,
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "error");
});

test("the find-me limiter reports 'error' (not 'denied') when the RPC call itself throws", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => {
      throw new Error("connection reset");
    },
    getDailyLimit: async () => 20,
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "error");
});

test("the find-me limiter delegates one event-and-session attempt to its RPC, using the platform's configured daily limit", async () => {
  const calls: Array<{ eventId: string; guestSessionId: string; windowSeconds: number; maxAttempts: number }> = [];
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
    getDailyLimit: async () => 20,
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "allowed");
  assert.deepEqual(calls, [{ eventId: "event-1", guestSessionId: "session-1", windowSeconds: 86400, maxAttempts: 20 }]);
});

// The cap is a founder-controlled platform setting, not a code constant —
// this proves a non-default value actually reaches the RPC call rather than
// the limiter ignoring getDailyLimit() and hardcoding something itself.
test("the find-me limiter passes through whatever daily limit the platform setting currently holds", async () => {
  const calls: Array<{ maxAttempts: number }> = [];
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
    getDailyLimit: async () => 50,
  });

  await limiter.allowAttempt("event-1", "session-1");
  assert.equal(calls[0]?.maxAttempts, 50);
});

test("the find-me limiter reports 'denied' when the RPC itself says no", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: false, error: null }),
    getDailyLimit: async () => 20,
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), "denied");
});
