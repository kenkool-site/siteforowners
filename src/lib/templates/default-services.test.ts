import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SERVICES } from "./default-services";
import { serviceDefaultImage, slugifyServiceName } from "./service-images";

const PATH_RE = /^\/defaults\/services\/[a-z_]+\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/;
const PUBLIC_DIR = join(process.cwd(), "public");

test("slugifyServiceName handles &, /, apostrophes, parens, and spaces", () => {
  assert.equal(slugifyServiceName("Wash & Blowout"), "wash-and-blowout");
  assert.equal(slugifyServiceName("Cornrows / Feed-In Braids"), "cornrows-feed-in-braids");
  assert.equal(slugifyServiceName("Nail Art (per nail)"), "nail-art-per-nail");
  assert.equal(slugifyServiceName("Men's Braids / Cornrows"), "mens-braids-cornrows");
});

test("every default service has a non-empty name, price, and well-formed local image path", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    assert.ok(services.length > 0, `${type} has no default services`);
    for (const svc of services) {
      assert.ok(svc.name?.trim(), `${type}: a service is missing a name`);
      assert.ok(svc.price?.trim(), `${type}: "${svc.name}" is missing a price`);
      assert.ok(svc.image, `${type}: "${svc.name}" is missing an image`);
      assert.match(svc.image!, PATH_RE, `${type}: "${svc.name}" has a malformed image path`);
    }
  }
});

test("every default service image file exists in public/", () => {
  const missing: string[] = [];
  for (const services of Object.values(DEFAULT_SERVICES)) {
    for (const svc of services) {
      if (!existsSync(join(PUBLIC_DIR, svc.image!))) missing.push(svc.image!);
    }
  }
  assert.deepEqual(missing, [], `missing image files:\n${missing.join("\n")}`);
});

test("default service images are unique within each vertical", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    const paths = services.map((s) => s.image!);
    assert.equal(new Set(paths).size, paths.length, `${type} reuses the same image across cards`);
  }
});

test("base verticals build their image path from the service name", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    if (type === "locs_and_braids") continue; // combined reuses braids/locs paths by design
    for (const svc of services) {
      assert.equal(svc.image, serviceDefaultImage(type as never, svc.name));
    }
  }
});
