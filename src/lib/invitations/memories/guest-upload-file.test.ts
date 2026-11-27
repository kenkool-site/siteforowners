import assert from "node:assert/strict";
import test from "node:test";
import { genericPosterFile, resolveGuestUpload } from "./guest-upload-file";

test("an iPhone capture is a video even when the browser leaves the MIME type blank", () => {
  // The filename from the live failure: a numeric prefix, a UUID, and .MOV.
  // Safari reports type "" or application/octet-stream for that file.
  const named = "81748560966__0FD76A87-7894-424D-ABCD.MOV";
  assert.deepEqual(resolveGuestUpload({ name: named, type: "" }), { mediaKind: "video", contentType: "video/quicktime" });
  assert.deepEqual(resolveGuestUpload({ name: named, type: "application/octet-stream" }), { mediaKind: "video", contentType: "video/quicktime" });
  assert.deepEqual(resolveGuestUpload({ name: named, type: "video/quicktime" }), { mediaKind: "video", contentType: "video/quicktime" });
});

test("camera-roll and phone containers map onto the types storage will accept", () => {
  assert.deepEqual(resolveGuestUpload({ name: "clip.mp4", type: "video/mp4" }), { mediaKind: "video", contentType: "video/mp4" });
  assert.deepEqual(resolveGuestUpload({ name: "clip.webm", type: "" }), { mediaKind: "video", contentType: "video/webm" });
  assert.deepEqual(resolveGuestUpload({ name: "clip.m4v", type: "video/x-m4v" }), { mediaKind: "video", contentType: "video/mp4" });
  assert.deepEqual(resolveGuestUpload({ name: "photo.JPG", type: "" }), { mediaKind: "photo", contentType: "image/jpeg" });
  assert.equal(resolveGuestUpload({ name: "clip.avi", type: "video/avi" }), null);
  assert.equal(resolveGuestUpload({ name: "81748560966__0FD76A87-7894-424D", type: "" }), null);
});

test("the fallback poster is a real JPEG so a capture failure can still finish", async () => {
  const poster = genericPosterFile();
  assert.equal(poster.type, "image/jpeg");
  const bytes = new Uint8Array(await poster.arrayBuffer());
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
});
