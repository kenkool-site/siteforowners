import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const verticalImages = [
  "public/marketing/verticals/locs.png",
  "public/marketing/verticals/braids.png",
  "public/marketing/verticals/haircuts.png",
  "public/marketing/verticals/nails.png",
];

test("marketing vertical images are available as public assets", async () => {
  for (const image of verticalImages) {
    await access(image);
  }
});

test("customer previews use the public vertical images", async () => {
  const source = await readFile("src/app/(marketing)/_components/CustomerView.tsx", "utf8");

  for (const image of [
    "/marketing/verticals/locs.png",
    "/marketing/verticals/braids.png",
    "/marketing/verticals/haircuts.png",
    "/marketing/verticals/nails.png",
  ]) {
    assert.match(source, new RegExp(image), `CustomerView should reference ${image}`);
  }
});
