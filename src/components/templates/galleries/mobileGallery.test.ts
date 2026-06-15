import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_GALLERY_PREVIEW_LIMIT,
  getVisibleMobileGalleryImages,
  hasMoreMobileGalleryImages,
} from "./mobileGallery";

const images = Array.from({ length: 12 }, (_, index) => `image-${index + 1}`);

test("mobile gallery preview is limited to nine images", () => {
  assert.equal(MOBILE_GALLERY_PREVIEW_LIMIT, 9);
  assert.deepEqual(
    getVisibleMobileGalleryImages(images, false),
    images.slice(0, 9),
  );
});

test("expanded mobile gallery returns every image", () => {
  assert.equal(getVisibleMobileGalleryImages(images, true), images);
});

test("mobile gallery only offers expansion above nine images", () => {
  assert.equal(hasMoreMobileGalleryImages(images), true);
  assert.equal(hasMoreMobileGalleryImages(images.slice(0, 9)), false);
});
