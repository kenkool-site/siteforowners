import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvitationMediaPath,
  createInvitationMediaSnapshot,
  finalizeInvitationMediaUpload,
  getSignedInvitationMedia,
  isInvitationMediaPathForEvent,
  isInvitationMediaOrphan,
  validateInvitationGalleryCount,
  validateInvitationMedia,
  type InvitationMediaFile,
} from "./media";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const MP4 = Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);

function fakeFile(
  type: string,
  size: number,
  name = type === "image/jpeg" ? "photo.jpg" : `photo.${type.split("/")[1]}`,
  bytes: Uint8Array = type === "image/jpeg" ? JPEG : type === "image/png" ? PNG : type === "image/webp" ? WEBP : type === "video/mp4" ? MP4 : WEBM,
): InvitationMediaFile {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

test("accepts configured image formats and rejects oversize files", async () => {
  assert.equal((await validateInvitationMedia(fakeFile("image/webp", 10 * 1024 * 1024), "cover")).ok, true);
  assert.equal((await validateInvitationMedia(fakeFile("image/jpeg", 10 * 1024 * 1024 + 1), "cover")).ok, false);
});

test("requires the image MIME, extension, and magic bytes to describe the same format", async () => {
  assert.deepEqual(await validateInvitationMedia(fakeFile("image/jpeg", 1024, "photo.png", JPEG), "gallery"), {
    ok: false,
    code: "invalid_media_type",
  });
  assert.deepEqual(await validateInvitationMedia(fakeFile("image/jpeg", 1024, "photo.jpg", PNG), "designed_invite"), {
    ok: false,
    code: "invalid_media_type",
  });
});

test("accepts MP4 and WebM only when readable duration is at most sixty seconds", async () => {
  const readDurationSeconds = async () => 60;
  assert.equal((await validateInvitationMedia(fakeFile("video/mp4", 1024, "clip.mp4"), "video", { readDurationSeconds })).ok, true);
  assert.equal((await validateInvitationMedia(fakeFile("video/webm", 1024, "clip.webm"), "video", { readDurationSeconds })).ok, true);
});

test("rejects video longer than sixty seconds", async () => {
  const result = await validateInvitationMedia(fakeFile("video/mp4", 1024, "clip.mp4"), "video", {
    readDurationSeconds: async () => 60.01,
  });
  assert.deepEqual(result, { ok: false, code: "video_too_long" });
});

test("rejects oversize and unreadable video", async () => {
  assert.deepEqual(await validateInvitationMedia(fakeFile("video/webm", 50 * 1024 * 1024 + 1, "clip.webm"), "video", {
    readDurationSeconds: async () => 1,
  }), { ok: false, code: "file_too_large" });
  assert.deepEqual(await validateInvitationMedia(fakeFile("video/webm", 1024, "clip.webm"), "video", {
    readDurationSeconds: async () => undefined,
  }), { ok: false, code: "video_duration_unreadable" });
  assert.deepEqual(await validateInvitationMedia(fakeFile("video/webm", 1024, "clip.webm"), "video", {
    readDurationSeconds: async () => { throw new Error("bad container"); },
  }), { ok: false, code: "video_duration_unreadable" });
});

test("builds event-scoped random paths with the validated extension", () => {
  const first = buildInvitationMediaPath("event-1", "gallery", "webp");
  const second = buildInvitationMediaPath("event-1", "gallery", "webp");
  assert.match(first, /^event-1\/gallery\/[0-9a-f-]{36}\.webp$/);
  assert.notEqual(first, second);
});

test("delete path checks reject another event, kind, or nested path", () => {
  assert.equal(isInvitationMediaPathForEvent("event-1/cover/id.png", "event-1", "cover"), true);
  assert.equal(isInvitationMediaPathForEvent("event-2/cover/id.png", "event-1", "cover"), false);
  assert.equal(isInvitationMediaPathForEvent("event-1/video/id.mp4", "event-1", "cover"), false);
  assert.equal(isInvitationMediaPathForEvent("event-1/cover/nested/id.png", "event-1", "cover"), false);
});

test("signed invitation reads expire after fifteen minutes", async () => {
  let receivedExpiry = 0;
  const signedUrl = await getSignedInvitationMedia("event-1/cover/id.png", {
    createSignedUrl: async (_path, expiresIn) => {
      receivedExpiry = expiresIn;
      return "https://storage.example.test/signed";
    },
  });
  assert.equal(receivedExpiry, 15 * 60);
  assert.equal(signedUrl, "https://storage.example.test/signed");
});

test("management snapshot signs singleton and gallery media", async () => {
  const signedPaths: string[] = [];
  const result = await createInvitationMediaSnapshot({
    id: "event-1",
    designedInvitePath: "event-1/designed_invite/a.jpg",
    coverImagePath: null,
    videoPath: "event-1/video/b.mp4",
  }, {
    listGallery: async () => [{
      id: "gallery-1",
      storagePath: "event-1/gallery/c.webp",
      altText: "Guests dancing",
      sortOrder: 0,
    }],
    sign: async (path) => {
      signedPaths.push(path);
      return `signed:${path}`;
    },
  });
  assert.deepEqual(signedPaths, [
    "event-1/designed_invite/a.jpg",
    "event-1/video/b.mp4",
    "event-1/gallery/c.webp",
  ]);
  assert.equal(result.designedInvite?.url, "signed:event-1/designed_invite/a.jpg");
  assert.equal(result.gallery[0]?.altText, "Guests dancing");
});

test("gallery count allows twelve rows and rejects a thirteenth", () => {
  assert.deepEqual(validateInvitationGalleryCount(11), { ok: true });
  assert.deepEqual(validateInvitationGalleryCount(12), { ok: false, code: "gallery_full" });
});

test("database failure removes the new object and preserves the replaced object", async () => {
  const stored = new Set(["event-1/cover/old.jpg"]);
  await assert.rejects(finalizeInvitationMediaUpload({
    newPath: "event-1/cover/new.jpg",
    oldPath: "event-1/cover/old.jpg",
    upload: async (path) => { stored.add(path); },
    finalize: async () => { throw new Error("database unavailable"); },
    remove: async (path) => { stored.delete(path); },
  }), /database unavailable/);
  assert.deepEqual(Array.from(stored), ["event-1/cover/old.jpg"]);
});

test("successful replacement deletes the old object only after database finalization", async () => {
  const calls: string[] = [];
  await finalizeInvitationMediaUpload({
    newPath: "event-1/video/new.mp4",
    oldPath: "event-1/video/old.mp4",
    upload: async () => { calls.push("upload"); },
    finalize: async () => { calls.push("finalize"); },
    remove: async () => { calls.push("remove-old"); },
  });
  assert.deepEqual(calls, ["upload", "finalize", "remove-old"]);
});

test("only old unreferenced objects are cleanup candidates", () => {
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-10T00:00:00Z", referenced: false }, new Date("2026-09-12T00:00:00Z")), true);
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-11T12:01:00Z", referenced: false }, new Date("2026-09-12T00:00:00Z")), false);
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-10T00:00:00Z", referenced: true }, new Date("2026-09-12T00:00:00Z")), false);
  assert.equal(isInvitationMediaOrphan({ createdAt: "2026-09-11T00:00:00Z", referenced: false }, new Date("2026-09-12T00:00:00Z")), false);
});
