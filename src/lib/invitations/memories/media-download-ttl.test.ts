import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHOTO_SIGNED_URL_SECONDS, VIDEO_ORIGINAL_SIGNED_URL_SECONDS, signedDownloadTtlSeconds } from "./media-download-ttl";

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
