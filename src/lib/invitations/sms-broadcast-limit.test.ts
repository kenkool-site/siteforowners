import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SMS_BROADCAST_LIMIT,
  MAX_SMS_BROADCAST_LIMIT,
  SMS_BROADCAST_LIMIT_ENV,
  effectiveSmsBroadcastLimit,
  parsePlatformSmsBroadcastLimit,
  platformSmsBroadcastLimit,
  smsBroadcastRemaining,
} from "./sms-broadcast-limit";

test("the platform default is 500 when the env var is missing or invalid", () => {
  assert.equal(parsePlatformSmsBroadcastLimit(undefined), DEFAULT_SMS_BROADCAST_LIMIT);
  assert.equal(parsePlatformSmsBroadcastLimit(""), DEFAULT_SMS_BROADCAST_LIMIT);
  assert.equal(parsePlatformSmsBroadcastLimit("0"), DEFAULT_SMS_BROADCAST_LIMIT);
  assert.equal(parsePlatformSmsBroadcastLimit("-5"), DEFAULT_SMS_BROADCAST_LIMIT);
  assert.equal(parsePlatformSmsBroadcastLimit("50abc"), DEFAULT_SMS_BROADCAST_LIMIT);
  assert.equal(parsePlatformSmsBroadcastLimit(String(MAX_SMS_BROADCAST_LIMIT + 1)), DEFAULT_SMS_BROADCAST_LIMIT);
  const withoutLimit = { ...process.env };
  delete withoutLimit[SMS_BROADCAST_LIMIT_ENV];
  assert.equal(platformSmsBroadcastLimit(withoutLimit), DEFAULT_SMS_BROADCAST_LIMIT);
});

test("a positive env var replaces the platform default and a per-event override wins", () => {
  const env = { ...process.env, [SMS_BROADCAST_LIMIT_ENV]: "800" };
  assert.equal(platformSmsBroadcastLimit(env), 800);
  assert.equal(effectiveSmsBroadcastLimit(null, env), 800);
  assert.equal(effectiveSmsBroadcastLimit(undefined, env), 800);
  assert.equal(effectiveSmsBroadcastLimit(1200, env), 1200);
  assert.equal(effectiveSmsBroadcastLimit(0, env), 800);
});

test("remaining guest texts never go below zero", () => {
  assert.equal(smsBroadcastRemaining(500, 20), 480);
  assert.equal(smsBroadcastRemaining(500, 500), 0);
  assert.equal(smsBroadcastRemaining(500, 900), 0);
});
