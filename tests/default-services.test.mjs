import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview business types include separate locs vertical", async () => {
  const types = await readFile("src/lib/ai/types.ts", "utf8");
  const wizard = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");

  assert.match(types, /'locs'/, "BusinessType should include locs");
  assert.match(wizard, /value:\s*"locs",\s*label:\s*"Locs"/, "wizard should expose Locs separately");
});

test("braids and locs fallback service lists are image-backed and capped", async () => {
  const defaults = await readFile("src/lib/templates/default-services.ts", "utf8");

  for (const vertical of ["braids", "locs"]) {
    const match = defaults.match(new RegExp(`${vertical}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`, "m"));
    assert.ok(match, `missing ${vertical} default services`);

    const block = match[1];
    const serviceCount = (block.match(/name:/g) || []).length;
    const imageCount = (block.match(/image:/g) || []).length;

    assert.ok(serviceCount > 0, `${vertical} should have default services`);
    assert.ok(serviceCount <= 10, `${vertical} should have at most 10 default services`);
    assert.equal(imageCount, serviceCount, `${vertical} services should each include a default image`);
  }
});
