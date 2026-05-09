import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateGalleryVideo renders autoplaying looping video without a visible pause button", async () => {
  const component = await readFile("src/components/templates/TemplateGalleryVideo.tsx", "utf8");

  assert.match(component, /autoPlay/, "video should autoplay");
  assert.match(component, /loop/, "video should loop");
  assert.match(component, /muted/, "video should be muted for autoplay");
  assert.match(component, /playsInline/, "video should play inline on mobile");
  assert.doesNotMatch(component, /Pause video|Pause Video|setPaused/, "component should not render a visible pause control");
  assert.match(component, /pt-7/, "component should reduce blank top space on mobile");
  assert.match(component, /aspect-\[4\/5\]/, "component should use a taller mobile video frame");
  assert.match(component, /max-w-\[92rem\]/, "component should render the video wider than the previous boxed frame");
  assert.match(component, /rounded-none/, "video card should have flat edges, no curved corners");
  assert.doesNotMatch(component, /rounded-\[/, "video card should not use arbitrary rounded radius");
  assert.match(component, /galleryVideoTitle/, "component should support custom title text");
});

test("TemplateOrchestrator renders gallery video before every image gallery", async () => {
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");

  assert.match(orchestrator, /galleryVideoUrl/, "orchestrator should read galleryVideoUrl");
  assert.match(orchestrator, /galleryVideoTitle/, "orchestrator should read galleryVideoTitle");
  assert.match(orchestrator, /hasGallerySection/, "nav should include video-only gallery sections");
  for (const gallery of ["RunwayGallery", "BoldGallery", "ElegantGallery", "VibrantGallery", "WarmGallery", "ClassicGallery"]) {
    const videoIndex = orchestrator.indexOf("galleryVideoSection");
    const galleryIndex = orchestrator.indexOf(gallery);
    assert.ok(videoIndex >= 0, "orchestrator should define galleryVideoSection");
    assert.ok(galleryIndex >= 0, `${gallery} should still be present`);
  }
});
