import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SERVICES } from "./default-services";

const PEXELS_RE = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\/pexels-photo-\1\.jpeg\?/;

test("every default service has a non-empty name, price, and curated image", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    assert.ok(services.length > 0, `${type} has no default services`);
    for (const svc of services) {
      assert.ok(svc.name?.trim(), `${type}: a service is missing a name`);
      assert.ok(svc.price?.trim(), `${type}: "${svc.name}" is missing a price`);
      assert.ok(svc.image, `${type}: "${svc.name}" is missing an image`);
      assert.match(
        svc.image!,
        PEXELS_RE,
        `${type}: "${svc.name}" image is not a well-formed Pexels URL`,
      );
    }
  }
});

test("default service images are unique within each vertical", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    const ids = services.map((s) => s.image!.match(PEXELS_RE)![1]);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${type} reuses the same photo across multiple service cards`,
    );
  }
});
