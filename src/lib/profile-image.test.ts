import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectProfileImageType,
  profileImageTypeMatches,
} from "./profile-image";

test("detects JPEG by its signature", () => {
  assert.deepEqual(detectProfileImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), {
    extension: "jpg",
    contentType: "image/jpeg",
  });
});

test("detects PNG by its signature", () => {
  assert.deepEqual(
    detectProfileImageType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    {
      extension: "png",
      contentType: "image/png",
    },
  );
});

test("detects WebP by RIFF and WEBP signatures", () => {
  assert.deepEqual(
    detectProfileImageType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        0x50,
      ]),
    ),
    {
      extension: "webp",
      contentType: "image/webp",
    },
  );
});

test("rejects truncated image signatures", () => {
  assert.equal(detectProfileImageType(Uint8Array.from([0xff, 0xd8])), null);
  assert.equal(
    detectProfileImageType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]),
    ),
    null,
  );
  assert.equal(
    detectProfileImageType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
      ]),
    ),
    null,
  );
});

test("rejects spoofed image data", () => {
  assert.equal(
    detectProfileImageType(
      Uint8Array.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x57, 0x45, 0x42, 0x50,
      ]),
    ),
    null,
  );
  assert.equal(
    detectProfileImageType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x4e, 0x4f, 0x50,
        0x45,
      ]),
    ),
    null,
  );
});

test("requires the declared MIME type to match the detected type", () => {
  const jpeg = { extension: "jpg" as const, contentType: "image/jpeg" as const };

  assert.equal(profileImageTypeMatches("image/jpeg", jpeg), true);
  assert.equal(profileImageTypeMatches("image/png", jpeg), false);
  assert.equal(profileImageTypeMatches("image/gif", jpeg), false);
  assert.equal(profileImageTypeMatches("", jpeg), false);
});
