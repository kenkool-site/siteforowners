import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../app/api/invitations/events/[eventId]/comments/route.ts", import.meta.url), "utf8");

test("guestbook management route protects and event-scopes every mutation", () => {
  assert.match(source, /requireInvitationAccess\(request, eventId\)/);
  assert.match(source, /isSameOrigin\(request\)/);
  assert.match(source, /setInvitationCommentHidden\(params\.eventId, values\.commentId/);
  assert.match(source, /removeInvitationComment\(params\.eventId, values\.commentId\)/);
  assert.match(source, /isInvitationCommentId/);
});
