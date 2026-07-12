import assert from "node:assert/strict";
import test from "node:test";

import { validateEstimatePhotoSelection } from "./estimate-photo-selection";

test("a corrected photo selection is valid on the first submit after an earlier photo error", () => {
  const validPhoto = { size: 1024, type: "image/jpeg" };

  assert.equal(
    validateEstimatePhotoSelection([validPhoto]),
    undefined,
  );
});
