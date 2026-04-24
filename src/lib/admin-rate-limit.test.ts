import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, RateLimitState } from "./admin-rate-limit";

const base = Math.floor(Date.now() / 1000);

function state(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    failsLast15Min: 0,
    failsLastHour: 0,
    lockedUntil: null,
    ...overrides,
  };
}

test("decide: permits when no prior failures", () => {
  const d = decide(state(), base);
  assert.equal(d.allow, true);
});

test("decide: blocks when inside 15-min cooldown (>= 5 fails)", () => {
  const d = decide(state({ failsLast15Min: 5 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "cooldown_15min");
});

test("decide: permits at 4 fails in 15 min", () => {
  const d = decide(state({ failsLast15Min: 4 }), base);
  assert.equal(d.allow, true);
});

test("decide: blocks when 10+ fails in 1 hour (account lockout)", () => {
  const d = decide(state({ failsLastHour: 10 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "lockout_1hour");
});

test("decide: blocks when lockedUntil is in future", () => {
  const d = decide(state({ lockedUntil: base + 600 }), base);
  assert.equal(d.allow, false);
  assert.equal(d.reason, "lockout_1hour");
});

test("decide: permits when lockedUntil is in past", () => {
  const d = decide(state({ lockedUntil: base - 10 }), base);
  assert.equal(d.allow, true);
});
