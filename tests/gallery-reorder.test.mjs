import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GalleryEditor exposes image reorder controls", async () => {
  const source = await readFile("src/app/site/[slug]/admin/_components/GalleryEditor.tsx", "utf8");

  assert.match(source, /function moveImage/, "GalleryEditor should have a move helper");
  assert.match(source, /aria-label=\{`Move photo \$\{i \+ 1\} earlier`\}/, "GalleryEditor should expose move earlier control");
  assert.match(source, /aria-label=\{`Move photo \$\{i \+ 1\} later`\}/, "GalleryEditor should expose move later control");
});

test("SiteEditor persists the gallery image order", async () => {
  const source = await readFile("src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx", "utf8");

  assert.match(source, /images,\s*\n\s*hero_video_url/s, "SiteEditor should save the current ordered images array");
  assert.match(source, /<GalleryEditor\s*\n\s*images=\{images\}\s*\n\s*onChange=\{setImages\}/s, "SiteEditor should let GalleryEditor mutate image order");
});
