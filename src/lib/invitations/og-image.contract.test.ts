import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("invitation routes replace the root SiteForOwners social image with an event image", () => {
  const files = [
    "../../app/invite/[slug]/opengraph-image.tsx",
    "../../app/invite/[slug]/twitter-image.tsx",
    "../../app/invite/[slug]/memories/opengraph-image.tsx",
    "../../app/invite/[slug]/memories/twitter-image.tsx",
    "../../app/i/[token]/opengraph-image.tsx",
    "../../app/i/[token]/twitter-image.tsx",
    "../../app/api/invitations/public/[slug]/og/route.ts",
    "../../app/api/invitations/public/[slug]/og/memories/route.ts",
  ];
  for (const file of files) {
    const contents = source(file);
    assert.match(contents, /invitationOpenGraphResponse|PersonalOpenGraphImage|PersonalTwitterImage/);
    assert.doesNotMatch(contents, /siteforowners-social-preview|SiteForOwners/);
  }
  const personal = source("../../app/i/[token]/opengraph-image.tsx");
  assert.doesNotMatch(personal, /markGuestOpened/);
  assert.match(personal, /privateGuestListEnabled/);
});

test("the message route forwards an optional recipient list and rejects ids the server does not accept", () => {
  const contents = source("../../app/api/invitations/events/[eventId]/messages/route.ts");
  assert.match(contents, /recipientIds: parsed\.value\.recipientIds/);
  assert.match(contents, /InvitationBroadcastError/);
  assert.equal(contents.includes("createInvitationBroadcast"), false);
});
