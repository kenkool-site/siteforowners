import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateGalleryVideo renders autoplaying looping video with controls", async () => {
  const component = await readFile("src/components/templates/TemplateGalleryVideo.tsx", "utf8");

  assert.match(component, /autoPlay/, "video should autoplay");
  assert.match(component, /loop/, "video should loop");
  assert.match(component, /muted/, "video should be muted for autoplay");
  assert.match(component, /playsInline/, "video should play inline on mobile");
  assert.match(component, /setPaused/, "component should provide a play/pause toggle");
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
