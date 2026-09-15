import assert from "node:assert/strict";
import test from "node:test";
import { createMediaUploadTicket, verifyMediaUploadTicket, finalizeDirectMedia } from "./direct-media";

const secret = "media-test-secret-at-least-32-characters";
const eventId = "10000000-0000-4000-8000-000000000001";
const metadata = { kind: "cover" as const, name: "photo.png", type: "image/png", size: 8, altText: "", mediaId: null };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

test("direct upload tickets authorize only randomized same-event provisional objects and expire", () => {
  const result = createMediaUploadTicket(eventId, metadata, secret, 1000);
  assert.match(result.path, new RegExp(`^${eventId}/cover/provisional-[a-f0-9-]{36}\\.png$`));
  assert.ok(verifyMediaUploadTicket(result.ticket, eventId, secret, 1001));
  assert.equal(verifyMediaUploadTicket(result.ticket, "another-event", secret, 1001), null);
  assert.equal(verifyMediaUploadTicket(result.ticket + "tamper", eventId, secret, 1001), null);
  assert.equal(verifyMediaUploadTicket(result.ticket, eventId, secret, 1000 + 7200), null);
  assert.throws(() => createMediaUploadTicket(eventId, { ...metadata, size: 11 * 1024 * 1024 }, secret));
  assert.throws(() => createMediaUploadTicket(eventId, { ...metadata, type: "text/html" }, secret));
});

test("gallery upload tickets allow a blank optional photo description", () => {
  assert.doesNotThrow(() => createMediaUploadTicket(eventId, { ...metadata, kind: "gallery", altText: "" }, secret, 1000));
});

test("finalization validates actual bytes then attaches a distinct immutable final object", async () => {
  const result = createMediaUploadTicket(eventId, metadata, secret, 1000);
  const ticket = verifyMediaUploadTicket(result.ticket, eventId, secret, 1001)!;
  const operations: string[] = [];
  await finalizeDirectMedia(ticket, {
    download: async () => new Blob([png], { type: "image/png" }),
    upload: async (path, bytes) => { assert.deepEqual(bytes, png); operations.push(`upload:${path}`); },
    attach: async (path) => { assert.ok(!path.includes("provisional")); operations.push("attach"); return null; },
    remove: async (path) => { operations.push(`remove:${path}`); },
  });
  assert.match(operations[0]!, /^upload:/);
  assert.equal(operations[1], "attach");
  assert.equal(operations[2], `remove:${result.path}`);
});

test("bad MIME, magic, actual size and attach failure never publish a provisional object", async () => {
  for (const mode of ["mime", "magic", "size", "attach"] as const) {
    const result = createMediaUploadTicket(eventId, metadata, secret, 1000);
    const ticket = verifyMediaUploadTicket(result.ticket, eventId, secret, 1001)!;
    const removed: string[] = [];
    let attached = false;
    await assert.rejects(finalizeDirectMedia(ticket, {
      download: async () => new Blob([mode === "magic" ? new Uint8Array(8) : mode === "size" ? new Uint8Array(9) : png], { type: mode === "mime" ? "text/html" : "image/png" }),
      upload: async () => undefined,
      attach: async () => { attached = true; throw new Error("database unavailable"); },
      remove: async (path) => { removed.push(path); },
    }));
    assert.equal(attached, mode === "attach");
    assert.deepEqual(removed, [result.path]);
  }
});
