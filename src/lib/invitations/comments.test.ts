import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvitationGuestbookSummary,
  canUseInvitationCommentWall,
  decodeCommentCursor,
  encodeCommentCursor,
  parseInvitationCommentInput,
} from "./comments";

test("comment input trims valid text and retains the honeypot", () => {
  assert.deepEqual(parseInvitationCommentInput({ guestName: "  Ada  ", body: "  Congratulations!  ", website: "" }), {
    ok: true,
    value: { guestName: "Ada", body: "Congratulations!", honeypot: "" },
  });
});

test("comment input rejects missing and overlong values", () => {
  const missing = parseInvitationCommentInput({ guestName: " ", body: "" });
  assert.equal(missing.ok, false);
  const long = parseInvitationCommentInput({ guestName: "a".repeat(81), body: "b".repeat(1001) });
  assert.equal(long.ok, false);
  if (!long.ok) assert.deepEqual(Object.keys(long.errors).sort(), ["body", "guestName"]);
  assert.equal(parseInvitationCommentInput([]).ok, false);
});

test("comment cursors round-trip and malformed cursors fail closed", () => {
  const value = { createdAt: "2026-09-17T12:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" };
  assert.deepEqual(decodeCommentCursor(encodeCommentCursor(value)), value);
  assert.equal(decodeCommentCursor("not-a-cursor"), null);
});

test("comment wall follows invitation availability independently of RSVP closure", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(canUseInvitationCommentWall({ status: "published", expireAt: null, commentWallEnabled: true }, now), true);
  assert.equal(canUseInvitationCommentWall({ status: "rsvp_closed", expireAt: null, commentWallEnabled: true }, now), true);
  assert.equal(canUseInvitationCommentWall({ status: "offline", expireAt: null, commentWallEnabled: true }, now), false);
  assert.equal(canUseInvitationCommentWall({ status: "published", expireAt: null, commentWallEnabled: false }, now), false);
  assert.equal(canUseInvitationCommentWall({ status: "published", expireAt: "2026-09-17T11:59:59.000Z", commentWallEnabled: true }, now), false);
});

test("guestbook summary counts all comments and those newer than shared review time", () => {
  assert.deepEqual(buildInvitationGuestbookSummary({ enabled: true, reviewedAt: "2026-09-17T12:00:00.000Z", createdAt: ["2026-09-17T11:00:00.000Z", "2026-09-17T13:00:00.000Z"] }), {
    enabled: true, totalCount: 2, newCount: 1,
  });
});
