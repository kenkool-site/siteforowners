import test from "node:test";
import assert from "node:assert/strict";
import { serviceManifestImage } from "./service-images";
import { SERVICE_IMAGE_FILES } from "./service-image-manifest";

test("serviceManifestImage resolves a known manifest entry from the display name", () => {
  assert.equal(
    serviceManifestImage("braids", "Medium Box Braids"),
    SERVICE_IMAGE_FILES["braids/medium-box-braids"],
  );
});

test("serviceManifestImage applies slug rules (& -> and) before the lookup", () => {
  assert.equal(
    serviceManifestImage("locs", "Retwist & Style"),
    SERVICE_IMAGE_FILES["locs/retwist-and-style"],
  );
});

test("serviceManifestImage returns undefined when no default file exists", () => {
  assert.equal(serviceManifestImage("home_services", "Totally Unknown Service"), undefined);
  assert.equal(serviceManifestImage("home_services", ""), undefined);
});
