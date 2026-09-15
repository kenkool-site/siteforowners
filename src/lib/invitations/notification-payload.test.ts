import assert from "node:assert/strict";
import test from "node:test";
import { sealNotificationPayload, openNotificationPayload } from "./notification-payload";

test("private delivery payload is authenticated, opaque, randomized, and bound to its notification", () => {
  const raw = JSON.stringify({ html: "Guest private notes editToken=secret", from: "original@example.com" });
  const secret = "notification-test-secret-at-least-32-characters";
  const sealed = sealNotificationPayload(raw, "n-1", secret);
  assert.equal(openNotificationPayload(sealed, "n-1", secret), raw);
  assert.doesNotMatch(sealed, /Guest|editToken|original/);
  assert.notEqual(sealNotificationPayload(raw, "n-1", secret), sealed);
  assert.throws(() => openNotificationPayload(sealed, "n-2", secret));
  assert.throws(() => openNotificationPayload(sealed, "n-1", "different-secret-with-at-least-32-characters"));
  assert.throws(() => openNotificationPayload(`${sealed.slice(0, -8)}AAAAAAAA`, "n-1", secret));
  assert.throws(() => sealNotificationPayload(raw, "n-1", ""));
});
