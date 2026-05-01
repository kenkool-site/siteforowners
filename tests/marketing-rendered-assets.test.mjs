import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPaths = [
  "src/app/(marketing)/_components/HeroShowcase.tsx",
  "src/app/(marketing)/_components/CustomerView.tsx",
];

test("marketing product visuals do not depend on raw customer or hero screenshots", async () => {
  const forbiddenPaths = ["/marketing/customer-view/", "/marketing/hero/"];

  for (const path of componentPaths) {
    const source = await readFile(path, "utf8");

    for (const forbiddenPath of forbiddenPaths) {
      assert.equal(
        source.includes(forbiddenPath),
        false,
        `${path} should render product visuals instead of referencing ${forbiddenPath}`,
      );
    }
  }
});
