import assert from "node:assert/strict";
import test from "node:test";
import { galleryFallbackPhotos, hasProjectMedia, localizedText } from "./display";

test("localizedText returns Spanish copy when locale is es", () => {
  assert.equal(
    localizedText("es", { en: "Free estimates", es: "Estimados gratis" }),
    "Estimados gratis",
  );
});

test("localizedText returns empty string when Spanish copy is missing", () => {
  assert.equal(localizedText("es", { en: "Free estimates" }), "");
});

test("localizedText returns English copy when locale is en", () => {
  assert.equal(
    localizedText("en", { en: "Free estimates", es: "Estimados gratis" }),
    "Free estimates",
  );
});

test("hasProjectMedia detects any supported gallery image field", () => {
  assert.equal(hasProjectMedia({ id: "a", image: "https://example.com/a.jpg" }), true);
  assert.equal(hasProjectMedia({ id: "b", before_image: "https://example.com/b.jpg" }), true);
  assert.equal(hasProjectMedia({ id: "c", after_image: "https://example.com/c.jpg" }), true);
  assert.equal(hasProjectMedia({ id: "d" }), false);
});

test("galleryFallbackPhotos returns [] when any project has media", () => {
  const projects = [
    { id: "p1", caption_en: "no media" },
    { id: "p2", image: "https://example.com/x.jpg" },
  ];
  assert.deepEqual(galleryFallbackPhotos(projects, ["https://example.com/a.jpg"]), []);
});

test("galleryFallbackPhotos returns cleaned photos when no project has media", () => {
  const projects = [{ id: "p1", caption_en: "text only" }];
  assert.deepEqual(
    galleryFallbackPhotos(projects, ["https://example.com/a.jpg", "", 42, "  ", "https://example.com/b.jpg"]),
    ["https://example.com/a.jpg", "https://example.com/b.jpg"],
  );
});

test("galleryFallbackPhotos handles empty projects and non-array images", () => {
  assert.deepEqual(galleryFallbackPhotos([], ["https://example.com/a.jpg"]), ["https://example.com/a.jpg"]);
  assert.deepEqual(galleryFallbackPhotos([], undefined), []);
  assert.deepEqual(galleryFallbackPhotos([], "not-an-array"), []);
});
