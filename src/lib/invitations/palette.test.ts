import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { assignInvitationPalette, extractInvitationPalette } from "./palette";

test("returns clustered dominant colors in coverage order", async () => {
  const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#F3F0E5" } })
    .composite([
      { input: { create: { width: 30, height: 100, channels: 3, background: "#245A38" } }, left: 0, top: 0 },
      { input: { create: { width: 20, height: 100, channels: 3, background: "#B88A53" } }, left: 30, top: 0 },
    ]).png().toBuffer();
  assert.deepEqual((await extractInvitationPalette(bytes)).slice(0, 3), ["#F0F0E0", "#206040", "#C09050"]);
});

test("rejects malformed image bytes", async () => {
  await assert.rejects(() => extractInvitationPalette(new Uint8Array([1, 2, 3])), /image/i);
});

test("assigns neutral, dark, and chromatic colors to readable semantic roles", () => {
  const result = assignInvitationPalette(["#EAEAE2", "#D4CEC3", "#ADB6A9", "#245A38", "#B88A53"]);
  assert.equal(result.background, "#EAEAE2");
  assert.equal(result.text, "#245A38");
  assert.equal(result.accent, "#B88A53");
  assert.equal(result.overlay, "#245A38");
  assert.equal(result.heroText, "#FFFFFF");
});
