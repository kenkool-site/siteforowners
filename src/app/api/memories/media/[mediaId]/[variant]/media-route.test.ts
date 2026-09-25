import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public media route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

// Structural, matching this feature's own convention for routes whose real
// work sits behind an unreachable seam (here: getMemoryMediaById's DB call
// and R2StorageProvider's signed-URL call) — see moderate-route.test.ts and
// moderation-route.test.ts. A video row's object_key_display/object_key_thumbnail
// are populated generically by markVideoMemoryMediaReady (see repository.ts:
// display = the video's own original, thumbnail = the client-captured poster),
// so this route needs no mediaKind-specific branching to serve video the same
// way it serves photo — this asserts that genericity holds, and would fail if
// a future change accidentally special-cased video here.
test("resolves display/thumbnail generically off the row, with no mediaKind-specific branching — video rides the same path as photo", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /params\.variant === "display" \? media\.objectKeyDisplay : media\.objectKeyThumbnail/);
  assert.doesNotMatch(source, /mediaKind/);
});
