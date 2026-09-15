import assert from "node:assert/strict";
import test from "node:test";
import { canManageInvitationCohost, parseInvitationCohostInput, uniqueEventIdsForHost } from "./hosts";

test("host event IDs are stable and deduplicated", () => {
  assert.deepEqual(uniqueEventIdsForHost([
    { event_id: "event-2" },
    { event_id: "event-1" },
    { event_id: "event-2" },
  ]), ["event-2", "event-1"]);
});

test("only founders and the primary host can replace a co-host", () => {
  assert.equal(canManageInvitationCohost({ kind: "founder" }, "primary-1"), true);
  assert.equal(canManageInvitationCohost({ kind: "owner", ownerId: "primary-1" }, "primary-1"), true);
  assert.equal(canManageInvitationCohost({ kind: "owner", ownerId: "cohost-1" }, "primary-1"), false);
  assert.equal(canManageInvitationCohost(null, "primary-1"), false);
});

test("co-host input normalizes email and requires separate six-digit credentials", () => {
  assert.deepEqual(parseInvitationCohostInput({ name: "  Sam Host ", email: " SAM@EXAMPLE.COM ", pin: "482901" }), {
    ok: true,
    value: { name: "Sam Host", email: "sam@example.com", pin: "482901" },
  });
  assert.deepEqual(parseInvitationCohostInput({ name: "Sam", email: "bad", pin: "1234" }), {
    ok: false,
    errors: { email: "Enter a valid co-host email address.", pin: "Use exactly six digits for the co-host PIN." },
  });
});
