import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHOTO_SIGNED_URL_SECONDS, VIDEO_ORIGINAL_SIGNED_URL_SECONDS, sharedSignedLink, signedDownloadTtlSeconds } from "./media-download-ttl";

test("video originals stay signed for an hour and everything else for five minutes", () => {
  assert.equal(signedDownloadTtlSeconds("video", "display"), VIDEO_ORIGINAL_SIGNED_URL_SECONDS);
  assert.equal(VIDEO_ORIGINAL_SIGNED_URL_SECONDS, 60 * 60);
  assert.equal(signedDownloadTtlSeconds("video", "thumbnail"), PHOTO_SIGNED_URL_SECONDS);
  assert.equal(signedDownloadTtlSeconds("photo", "display"), 5 * 60);
  assert.equal(signedDownloadTtlSeconds("photo", "thumbnail"), 5 * 60);
});

test("guest and host media routes ask the shared helper for the ttl", () => {
  const guest = readFileSync(new URL("../../../app/api/memories/media/[mediaId]/[variant]/route.ts", import.meta.url), "utf8");
  const host = readFileSync(new URL("../../../app/api/invitations/events/[eventId]/memories/media/[mediaId]/[variant]/route.ts", import.meta.url), "utf8");
  for (const source of [guest, host]) {
    assert.match(source, /signedDownloadTtlSeconds\(media\.mediaKind/);
    assert.doesNotMatch(source, /5 \* 60/);
  }
});

test("everyone in the same hour gets the same link, still valid for at least the ttl", () => {
  const hour = 60 * 60 * 1000;
  const start = Date.UTC(2026, 11, 19, 20, 0, 0);
  const early = sharedSignedLink(300, start + 1000);
  const late = sharedSignedLink(300, start + hour - 1000);
  assert.equal(early.signingDate.getTime(), start);
  assert.equal(late.signingDate.getTime(), start);
  assert.equal(early.expiresInSeconds, 60 * 60 + 300);
  assert.equal(late.reuseSeconds, 1);
  assert.equal(early.reuseSeconds, 60 * 60 - 1);
  // Handed out at the very end of the hour, the link still has the ttl left.
  assert.ok(start + early.expiresInSeconds * 1000 - (start + hour) >= 300 * 1000);
  assert.equal(sharedSignedLink(300, start + hour).signingDate.getTime(), start + hour);
});
