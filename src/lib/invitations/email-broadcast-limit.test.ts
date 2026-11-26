import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EMAIL_BROADCAST_LIMIT,
  EMAIL_BROADCAST_LIMIT_ENV,
  MAX_EMAIL_BROADCAST_LIMIT,
  effectiveEmailBroadcastLimit,
  emailBroadcastRemaining,
  guestEmailBroadcastAllowed,
  parsePlatformEmailBroadcastLimit,
  platformEmailBroadcastLimit,
} from "./email-broadcast-limit";

test("the platform default is 1000 when the env var is missing or invalid", () => {
  assert.equal(parsePlatformEmailBroadcastLimit(undefined), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(parsePlatformEmailBroadcastLimit(""), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(parsePlatformEmailBroadcastLimit("0"), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(parsePlatformEmailBroadcastLimit("-5"), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(parsePlatformEmailBroadcastLimit("50abc"), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(parsePlatformEmailBroadcastLimit(String(MAX_EMAIL_BROADCAST_LIMIT + 1)), DEFAULT_EMAIL_BROADCAST_LIMIT);
  const withoutLimit = { ...process.env };
  delete withoutLimit[EMAIL_BROADCAST_LIMIT_ENV];
  assert.equal(platformEmailBroadcastLimit(withoutLimit), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(effectiveEmailBroadcastLimit(null, withoutLimit), DEFAULT_EMAIL_BROADCAST_LIMIT);
  assert.equal(effectiveEmailBroadcastLimit(undefined, withoutLimit), DEFAULT_EMAIL_BROADCAST_LIMIT);
});

test("a positive env var replaces the platform default and a per-event override wins", () => {
  const env = { ...process.env, [EMAIL_BROADCAST_LIMIT_ENV]: "800" };
  assert.equal(platformEmailBroadcastLimit(env), 800);
  assert.equal(effectiveEmailBroadcastLimit(null, env), 800);
  assert.equal(effectiveEmailBroadcastLimit(undefined, env), 800);
  assert.equal(effectiveEmailBroadcastLimit(2500, env), 2500);
  assert.equal(effectiveEmailBroadcastLimit(0, env), 800);
  assert.equal(effectiveEmailBroadcastLimit(1.5, env), 800);
});

test("host RSVP alert usage does not block a guest email broadcast", () => {
  // Mercy & John had already sent 250 host-alert and guest-confirmation emails
  // against email_notification_limit 250. Those rows are not an input here.
  const hostAlertsAndConfirmations = 250;
  const hostEmailLimit = 250;
  assert.equal(hostAlertsAndConfirmations >= hostEmailLimit, true);
  assert.equal(guestEmailBroadcastAllowed(0, null), true);
  assert.equal(guestEmailBroadcastAllowed(999, null), true);
  assert.equal(guestEmailBroadcastAllowed(1000, null), false);

  const env = { ...process.env, [EMAIL_BROADCAST_LIMIT_ENV]: "40" };
  assert.equal(effectiveEmailBroadcastLimit(null, env), 40);
  assert.equal(guestEmailBroadcastAllowed(0, null, env), true);
  assert.equal(guestEmailBroadcastAllowed(40, null, env), false);
  assert.equal(guestEmailBroadcastAllowed(40, 80, env), true);
  assert.equal(emailBroadcastRemaining(effectiveEmailBroadcastLimit(80, env), 40), 40);
});

test("remaining guest emails never go below zero", () => {
  assert.equal(emailBroadcastRemaining(1000, 20), 980);
  assert.equal(emailBroadcastRemaining(1000, 1000), 0);
  assert.equal(emailBroadcastRemaining(1000, 9000), 0);
});
