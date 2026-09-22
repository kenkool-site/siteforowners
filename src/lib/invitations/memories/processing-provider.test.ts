import assert from "node:assert/strict";
import test from "node:test";
import { deriveObjectKeys } from "./processing-provider";

test("derivative keys are deterministic, stage-prefixed for R2 notification filtering, and event/media-scoped", () => {
  const keys = deriveObjectKeys("event-1", "media-1");
  assert.equal(keys.display, "display/event-1/media-1.webp");
  assert.equal(keys.thumbnail, "thumbnails/event-1/media-1.webp");
});

test("a redelivered event notification for the same media produces the same keys, not a duplicate", () => {
  const first = deriveObjectKeys("event-1", "media-1");
  const second = deriveObjectKeys("event-1", "media-1");
  assert.deepEqual(first, second);
});
