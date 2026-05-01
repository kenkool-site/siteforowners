import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("marketing homepage has rich link-preview metadata", async () => {
  const layout = await readFile("src/app/layout.tsx", "utf8");

  assert.match(layout, /openGraph\s*:/, "metadata should define Open Graph fields");
  assert.match(layout, /twitter\s*:/, "metadata should define Twitter card fields");
  assert.match(layout, /\/opengraph-image/, "metadata should point crawlers to the Open Graph image");
  assert.match(layout, /\/twitter-image/, "metadata should point crawlers to the Twitter image");
});

test("marketing homepage has generated preview-image routes", async () => {
  await access("src/app/opengraph-image.tsx");
  await access("src/app/twitter-image.tsx");

  const ogImage = await readFile("src/app/opengraph-image.tsx", "utf8");
  const twitterImage = await readFile("src/app/twitter-image.tsx", "utf8");

  assert.match(ogImage, /ImageResponse/, "Open Graph image should be generated with ImageResponse");
  assert.match(
    twitterImage,
    /ImageResponse|opengraph-image/,
    "Twitter image should generate or reuse the generated Open Graph image",
  );
});
