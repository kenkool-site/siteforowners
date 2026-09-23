import { strict as assert } from "node:assert";
import { test } from "node:test";
import { process } from "./processing-provider";

test("processing emits WebP gallery derivatives and a JPEG moderation derivative", async () => {
  // A real 2x2 PNG fixture. The processing provider must normalize every
  // allowed upload format into bytes Rekognition accepts for moderation.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQ0bAR0bBhgFAADI4B4aUR2lQAAAAASUVORK5CYII=",
    "base64",
  );
  const result = await process(Uint8Array.from(png));

  assert.equal(Buffer.from(result.displayBytes.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.equal(Buffer.from(result.thumbnailBytes.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.deepEqual(Array.from(result.moderationBytes.subarray(0, 3)), [0xff, 0xd8, 0xff]);
});
