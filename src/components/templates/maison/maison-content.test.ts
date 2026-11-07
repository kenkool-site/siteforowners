import assert from "node:assert/strict";
import test from "node:test";
import {
  activeIndexFromScroll,
  assignServiceCardImages,
  nextCarouselIndex,
  orderMaisonServices,
  placeName,
  shouldAdvanceCarousel,
  signatureLine,
  splitBusinessName,
} from "./maison-content";

const ready = {
  isMobile: true,
  reducedMotion: false,
  documentHidden: false,
  inView: true,
  userPaused: false,
  hovered: false,
  touching: false,
  focused: false,
  now: 10_000,
  resumeAfter: 0,
  count: 4,
};

test("splitBusinessName keeps a byline on the second line", () => {
  assert.deepEqual(splitBusinessName("CROWN'D By Shera"), {
    lead: "CROWN'D",
    tail: "by Shera",
  });
  assert.equal(signatureLine("CROWN'D By Shera"), "By Shera.");
});

test("placeName reads the city from a short or street address", () => {
  assert.equal(placeName("Orlando, FL"), "Orlando");
  assert.equal(placeName("1400 Conway Rd, Orlando, FL 32812"), "Orlando");
  assert.equal(placeName(""), "");
});

test("service cards prefer a service image and only then cycle gallery photos", () => {
  const images = assignServiceCardImages(
    [{ image: "/services/knotless.png" }, { image: "  " }, {}, { image: "/services/boho.png" }],
    ["/gallery/a.jpg", "/gallery/b.jpg"],
  );
  assert.deepEqual(images, [
    "/services/knotless.png",
    "/gallery/a.jpg",
    "/gallery/b.jpg",
    "/services/boho.png",
  ]);
});

test("featured services lead without dropping the rest", () => {
  const ordered = orderMaisonServices([
    { name: "Kids", is_featured: false },
    { name: "Boho", is_featured: true },
    { name: "Box" },
  ]);
  assert.deepEqual(ordered.map((service) => service.name), ["Boho", "Kids", "Box"]);
});

test("carousel advances on a visible mobile track and loops", () => {
  assert.equal(shouldAdvanceCarousel(ready), true);
  assert.equal(shouldAdvanceCarousel({ ...ready, reducedMotion: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, isMobile: false }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, hovered: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, touching: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, focused: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, userPaused: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, inView: false }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, documentHidden: true }), false);
  assert.equal(shouldAdvanceCarousel({ ...ready, now: 100, resumeAfter: 500 }), false);
  assert.equal(nextCarouselIndex(3, 4), 0);
  assert.equal(activeIndexFromScroll(210, 100, 4), 2);
});
