// src/lib/invitations/memories/upload-window.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUploadWindowClosesAt, isUploadWindowOpen } from "./upload-window";

test("computeUploadWindowClosesAt adds 14 days to the event's start time", () => {
  assert.equal(
    computeUploadWindowClosesAt("2026-09-01T00:00:00.000Z"),
    "2026-09-15T00:00:00.000Z",
  );
});

test("computeUploadWindowClosesAt returns null for an undated event", () => {
  assert.equal(computeUploadWindowClosesAt(null), null);
});

test("isUploadWindowOpen is true before the 14-day mark", () => {
  const open = isUploadWindowOpen("2026-09-01T00:00:00.000Z", new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(open, true);
});

test("isUploadWindowOpen is false after the 14-day mark", () => {
  const open = isUploadWindowOpen("2026-09-01T00:00:00.000Z", new Date("2026-09-16T00:00:00.000Z"));
  assert.equal(open, false);
});

test("isUploadWindowOpen is always true for an undated event — matches the existing expireAt null-handling convention", () => {
  assert.equal(isUploadWindowOpen(null, new Date("2099-01-01T00:00:00.000Z")), true);
});
