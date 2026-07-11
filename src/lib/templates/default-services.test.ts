import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SERVICES, defaultGalleryImages } from "./default-services";
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
    if (type === "home_services") continue;
    assert.ok(services.length > 0, `${type} has no default services`);
    for (const svc of services) {
      assert.ok(svc.name?.trim(), `${type}: a service is missing a name`);
      assert.ok(svc.price?.trim(), `${type}: "${svc.name}" is missing a price`);
      assert.ok(svc.image, `${type}: "${svc.name}" is missing an image`);
      assert.match(svc.image!, PATH_RE, `${type}: "${svc.name}" has a malformed image path`);
    }
  }
});

test("home-services defaults omit booking prices and use stock imagery", () => {
  const services = DEFAULT_SERVICES.home_services;
  assert.equal(services.length, 8);
  for (const svc of services) {
    assert.ok(svc.name?.trim(), "home_services: a service is missing a name");
    assert.equal(svc.price, "", `home_services: "${svc.name}" should not show a price`);
    assert.ok(svc.image?.startsWith("https://"), `home_services: "${svc.name}" should use stock imagery`);
  }
});

test("every default service image file exists in public/", () => {
  const missing: string[] = [];
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    if (type === "home_services") continue;
    for (const svc of services) {
      if (!existsSync(join(PUBLIC_DIR, svc.image!))) missing.push(svc.image!);
    }
  }
  assert.deepEqual(missing, [], `missing image files:\n${missing.join("\n")}`);
});

test("default service images are unique within each vertical", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    if (type === "home_services") continue;
    const paths = services.map((s) => s.image!);
    assert.equal(new Set(paths).size, paths.length, `${type} reuses the same image across cards`);
  }
});

test("defaultGalleryImages returns deduped, well-formed local paths for every type", () => {
  for (const type of Object.keys(DEFAULT_SERVICES)) {
    if (type === "home_services") continue;
    const gallery = defaultGalleryImages(type as never);
    assert.ok(gallery.length > 0, `${type} default gallery is empty`);
    assert.equal(new Set(gallery).size, gallery.length, `${type} default gallery has duplicates`);
    for (const img of gallery) assert.match(img, PATH_RE, `${type}: malformed gallery path ${img}`);
  }
});

test("base verticals build their image path from the service name", () => {
  for (const [type, services] of Object.entries(DEFAULT_SERVICES)) {
    if (type === "locs_and_braids" || type === "home_services") continue;
    for (const svc of services) {
      assert.equal(svc.image, serviceDefaultImage(type as never, svc.name));
    }
  }
});
