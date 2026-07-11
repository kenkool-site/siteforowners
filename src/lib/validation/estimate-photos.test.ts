import assert from "node:assert/strict";
import test from "node:test";
import { validateEstimatePhotos, ESTIMATE_PHOTO_LIMITS } from "./estimate-photos";

const JPEG_SIG = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_SIG = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function imageFile(
  bytes: Uint8Array,
  name: string,
  type: string,
): File {
  return new File([bytes], name, { type });
}

function paddedBytes(signature: Uint8Array, totalSize: number): Uint8Array {
  const bytes = new Uint8Array(totalSize);
  bytes.set(signature);
  return bytes;
}

test("accepts valid JPEG with extension derived from detected type", async () => {
  const result = await validateEstimatePhotos([
    imageFile(JPEG_SIG, "job.jpg", "image/jpeg"),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.photos.length, 1);
    assert.equal(result.photos[0].extension, "jpg");
    assert.equal(result.photos[0].contentType.contentType, "image/jpeg");
    assert.equal(result.photos[0].sizeBytes, JPEG_SIG.length);
  }
});

test("accepts valid PNG with extension derived from detected type", async () => {
  const result = await validateEstimatePhotos([
    imageFile(PNG_SIG, "job.png", "image/png"),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.photos[0].extension, "png");
    assert.equal(result.photos[0].contentType.contentType, "image/png");
  }
});

test("accepts valid WebP with extension derived from detected type", async () => {
  const result = await validateEstimatePhotos([
    imageFile(WEBP_SIG, "job.webp", "image/webp"),
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.photos[0].extension, "webp");
    assert.equal(result.photos[0].contentType.contentType, "image/webp");
  }
});

test("rejects six files", async () => {
  const files = Array.from({ length: 6 }, (_, index) =>
    imageFile(JPEG_SIG, `job-${index}.jpg`, "image/jpeg"),
  );
  const result = await validateEstimatePhotos(files);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.reason === "too_many_files"));
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].index, ESTIMATE_PHOTO_LIMITS.maxFiles);
  }
});

test("rejects one file over 8 MB", async () => {
  const oversized = paddedBytes(JPEG_SIG, ESTIMATE_PHOTO_LIMITS.maxBytesPerFile + 1);
  const result = await validateEstimatePhotos([
    imageFile(oversized, "large.jpg", "image/jpeg"),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.index === 0 && error.reason === "file_too_large"));
  }
});

test("rejects total size over 25 MB", async () => {
  const fileSize = 6 * 1024 * 1024;
  const files = Array.from({ length: 5 }, (_, index) =>
    imageFile(paddedBytes(JPEG_SIG, fileSize), `job-${index}.jpg`, "image/jpeg"),
  );
  const result = await validateEstimatePhotos(files);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.reason === "total_too_large"));
  }
});

test("rejects declared JPEG with PNG bytes", async () => {
  const result = await validateEstimatePhotos([
    imageFile(PNG_SIG, "fake.jpg", "image/jpeg"),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.reason === "type_mismatch"));
  }
});

test("rejects executable or random bytes", async () => {
  const random = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01]);
  const result = await validateEstimatePhotos([
    imageFile(random, "evil.bin", "image/jpeg"),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.reason === "invalid_image"));
  }
});

test("returns all failing indices together", async () => {
  const random = Uint8Array.from([0x00, 0x01, 0x02]);
  const result = await validateEstimatePhotos([
    imageFile(JPEG_SIG, "good.jpg", "image/jpeg"),
    imageFile(random, "bad.bin", "image/png"),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].index, 1);
  }
});

test("accepts empty file list", async () => {
  const result = await validateEstimatePhotos([]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.photos, []);
});
