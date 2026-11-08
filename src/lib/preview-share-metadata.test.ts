import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewShareMetadata } from "./preview-share-metadata";

test("preview share metadata is noindex, self-canonical, and keeps the share card", () => {
  const metadata = buildPreviewShareMetadata({
    slug: "crown-room",
    name: "Crown Room",
    title: "Crown Room — Knotless braids",
    description: "Book knotless braids in Brooklyn.",
    image: "https://cdn.example/hero.jpg",
  });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(metadata.alternates?.canonical, "/preview/crown-room");
  assert.notEqual(metadata.alternates?.canonical, "/");
  assert.equal(metadata.openGraph?.title, "Crown Room — Knotless braids");
  assert.equal(metadata.openGraph?.description, "Book knotless braids in Brooklyn.");
  assert.equal(metadata.openGraph?.url, "/preview/crown-room");
  assert.match(JSON.stringify(metadata.openGraph?.images), /hero\.jpg/);
  assert.equal(metadata.twitter && "card" in metadata.twitter ? metadata.twitter.card : undefined, "summary_large_image");
});
