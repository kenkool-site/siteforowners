import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { compareHonoreeCrops, cropFaceJpeg, facesLeftToRight } from "./honor-faces";

test("orders detected faces from left to right", () => {
  const ordered = facesLeftToRight([
    { left: 0.6, top: 0.2, width: 0.2, height: 0.3 },
    { left: 0.1, top: 0.2, width: 0.2, height: 0.3 },
  ]);
  assert.equal(ordered[0]?.left, 0.1);
  assert.equal(ordered[1]?.left, 0.6);
});

test("crops a face region out of a photo", async () => {
  const source = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();
  const crop = await cropFaceJpeg(new Uint8Array(source), { left: 0.5, top: 0.25, width: 0.2, height: 0.4 });
  const meta = await sharp(crop).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok((meta.width ?? 0) < 200);
  assert.ok((meta.height ?? 0) < 100);
  assert.ok((meta.width ?? 0) > 10);
});

test("compareHonoreeCrops keeps only matches at or above the threshold", async () => {
  const calls: string[] = [];
  const matches = await compareHonoreeCrops(
    [{ honoreeId: "a", bytes: new Uint8Array([1]) }, { honoreeId: "b", bytes: new Uint8Array([2]) }],
    [{ mediaId: "m1", bytes: new Uint8Array([3]) }, { mediaId: "m2", bytes: new Uint8Array([4]) }],
    async (source, target) => {
      calls.push(`${source[0]}-${target[0]}`);
      return source[0] === 1 && target[0] === 4 ? 96 : 10;
    },
    80,
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(matches, [{ mediaId: "m2", honoreeId: "a", similarity: 96 }]);
});
