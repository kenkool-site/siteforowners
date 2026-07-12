import assert from "node:assert/strict";
import test from "node:test";

import {
  createEstimatePhotoSelectionState,
  selectEstimatePhotos,
  validateEstimatePhotoSelection,
} from "./estimate-photo-selection";

test("a corrected photo selection clears its stale error before the first submit", () => {
  const invalidPhoto = { size: 1024, type: "text/plain" };
  const validPhoto = { size: 1024, type: "image/jpeg" };
  const initial = createEstimatePhotoSelectionState();

  const invalid = selectEstimatePhotos(initial, [invalidPhoto]);
  assert.equal(invalid.error, "invalid");

  const corrected = selectEstimatePhotos(invalid, [validPhoto]);
  assert.equal(corrected.error, undefined);
  assert.deepEqual(corrected.photos, [validPhoto]);

  assert.equal(
    validateEstimatePhotoSelection(corrected.photos),
    undefined,
  );
});
