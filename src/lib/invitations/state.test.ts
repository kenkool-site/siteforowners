import test from "node:test";
import assert from "node:assert/strict";
import { canAcceptRsvp, getEffectiveEventState } from "./state";

const base = {
  status: "published" as const,
  rsvpDeadline: null,
  expireAt: null,
  rsvpOverrideOpen: false,
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

test("the host RSVP override reopens RSVP past a passed deadline", () => {
  const state = getEffectiveEventState(
    { ...base, rsvpDeadline: "2026-09-10T00:00:00Z", rsvpOverrideOpen: true },
    new Date("2026-09-11T00:00:00Z"),
  );
  assert.equal(state, "published");
  assert.equal(canAcceptRsvp(state), true);
});

test("the host RSVP override reopens RSVP despite an explicit rsvp_closed status", () => {
  const state = getEffectiveEventState(
    { ...base, status: "rsvp_closed", rsvpOverrideOpen: true },
    new Date(),
  );
  assert.equal(state, "published");
  assert.equal(canAcceptRsvp(state), true);
});

test("the host RSVP override never reopens an offline invitation", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "offline", rsvpOverrideOpen: true }, new Date()),
    "offline",
  );
});

test("the host RSVP override never reopens a draft invitation", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "draft", rsvpOverrideOpen: true }, new Date()),
    "draft",
  );
});

test("the host RSVP override never reopens an expired invitation (explicit status)", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "expired", rsvpOverrideOpen: true }, new Date()),
    "expired",
  );
});

test("the host RSVP override never reopens an expired invitation (expireAt passed)", () => {
  assert.equal(
    getEffectiveEventState(
      { ...base, expireAt: "2026-09-10T00:00:00Z", rsvpOverrideOpen: true },
      new Date("2026-09-11T00:00:00Z"),
    ),
    "expired",
  );
});

test("override=false preserves existing deadline-closure behavior", () => {
  const state = getEffectiveEventState(
    { ...base, rsvpDeadline: "2026-09-10T00:00:00Z", rsvpOverrideOpen: false },
    new Date("2026-09-11T00:00:00Z"),
  );
  assert.equal(state, "rsvp_closed");
  assert.equal(canAcceptRsvp(state), false);
});

test("override=false preserves existing explicit rsvp_closed behavior", () => {
  assert.equal(
    getEffectiveEventState({ ...base, status: "rsvp_closed", rsvpOverrideOpen: false }, new Date()),
    "rsvp_closed",
  );
});
