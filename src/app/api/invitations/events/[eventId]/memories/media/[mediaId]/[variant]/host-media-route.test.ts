import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("authenticated host media route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

// Structural, matching this feature's own convention for routes whose real
// work sits behind an unreachable seam (here: requireInvitationAccess,
// getMemoryMediaById's DB call, and R2StorageProvider's signed-URL call) —
// see moderate-route.test.ts and moderation-route.test.ts. A video row's
// object_key_display/object_key_thumbnail are populated generically by
// markVideoMemoryMediaReady (see repository.ts: display = the video's own
// original, thumbnail = the client-captured poster), so this route needs no
// mediaKind-specific branching to serve video the same way it serves photo —
// this asserts that genericity holds, and would fail if a future change
// accidentally special-cased video here.
test("resolves display/thumbnail generically off the row, with no mediaKind-specific branching — video rides the same path as photo", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /params\.variant === "display" \? media\.objectKeyDisplay : media\.objectKeyThumbnail/);
  // mediaKind may flow through as data (signedDownloadTtlSeconds takes it);
  // what must never appear is a kind-conditional choosing a different path.
  assert.doesNotMatch(source, /mediaKind\s*[=!]==/);
  assert.doesNotMatch(source, /"video"|"photo"/);
});

// The host's full-screen player asks this route for a video's Stream copy the
// same way guests ask /api/memories/media/[mediaId]/adaptive — authorized, and
// falling back to this route's own display variant until the copy is ready.
test("serves the adaptive variant through adaptivePlaybackLink with a display fallback", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /adaptivePlaybackLink/);
  assert.match(source, /params\.variant === "adaptive"/);
  assert.match(source, /memories\/media\/\$\{params\.mediaId\}\/display/);
});
