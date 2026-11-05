import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSharePreviewImage } from "./share-preview-image";

const imgs = ["https://cdn/hero.jpg", "https://cdn/about.jpg"];

test("uses custom about_image_url when set", () => {
  const copy = { section_settings: { about_image_url: "https://cdn/custom.jpg" } };
  assert.equal(pickSharePreviewImage(copy, imgs), "https://cdn/custom.jpg");
});

test("falls back to second gallery image, like the About section", () => {
  assert.equal(pickSharePreviewImage({}, imgs), "https://cdn/about.jpg");
  assert.equal(pickSharePreviewImage(null, imgs), "https://cdn/about.jpg");
});

test("uses first image when About image is hidden or missing", () => {
  const hidden = { section_settings: { show_about_image: false, about_image_url: "https://cdn/custom.jpg" } };
  assert.equal(pickSharePreviewImage(hidden, imgs), "https://cdn/hero.jpg");
  assert.equal(pickSharePreviewImage({}, ["https://cdn/hero.jpg"]), "https://cdn/hero.jpg");
});

test("returns undefined with no images", () => {
  assert.equal(pickSharePreviewImage({}, []), undefined);
  assert.equal(pickSharePreviewImage({}, null), undefined);
});
