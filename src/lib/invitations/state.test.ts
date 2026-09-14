import test from "node:test";
import assert from "node:assert/strict";
import { canAcceptRsvp, getEffectiveEventState } from "./state";

const base = {
  status: "published" as const,
  rsvpDeadline: null,
  expireAt: null,
};

test("deadline closes RSVPs while leaving the invitation visible", () => {
  const state = getEffectiveEventState(
    { ...base, rsvpDeadline: "2026-09-10T00:00:00Z" },
    new Date("2026-09-11T00:00:00Z"),
  );
  assert.equal(state, "rsvp_closed");
  assert.equal(canAcceptRsvp(state), false);
});

test("expire_at takes precedence over a published status", () => {
  assert.equal(
    getEffectiveEventState(
      { ...base, expireAt: "2026-09-10T00:00:00Z" },
      new Date("2026-09-11T00:00:00Z"),
    ),
    "expired",
  );
});

test("offline stays offline regardless of timestamps", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "offline" }, new Date()),
    "offline",
  );
});
