import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceFiles = [
  "src/components/templates/services/ClassicServices.tsx",
  "src/components/templates/services/BoldServices.tsx",
  "src/components/templates/services/ElegantServices.tsx",
  "src/components/templates/services/VibrantServices.tsx",
  "src/components/templates/services/WarmServices.tsx",
];

test("non-runway service templates preserve live booking/category behavior", async () => {
  for (const file of serviceFiles) {
    const source = await readFile(file, "utf8");

    assert.match(source, /groupServices\(services as unknown as ServiceItem\[\], categories\)/, `${file} should keep category grouping`);
    assert.match(source, /openBookingCalendarForService/, `${file} should keep in-site booking behavior`);
    assert.match(source, /requestBookingChoice/, `${file} should keep dual booking choice behavior`);
    assert.match(source, /window\.open\(service\.bookingDeepLink/, `${file} should keep external booking behavior`);
  }
});

test("non-runway service templates use optimized image cards instead of raw img tags", async () => {
  for (const file of serviceFiles) {
    const source = await readFile(file, "utf8");

    assert.match(source, /import Image from "next\/image"/, `${file} should use Next Image for service photos`);
    assert.doesNotMatch(source, /<img[\s>]/, `${file} should not render raw img tags`);
    assert.match(source, /sizes=/, `${file} service images should define responsive sizes`);
  }
});

test("non-runway service templates avoid long service walls", async () => {
  for (const file of serviceFiles) {
    const source = await readFile(file, "utf8");

    assert.match(source, /INITIAL_SERVICE_LIMIT\s*=\s*9/, `${file} should cap initial service rendering`);
    assert.match(source, /visibleServices\s*=\s*shouldLimitGroup/, `${file} should render a limited initial service set`);
    assert.match(source, /View all \{group\.services\.length\} services/, `${file} should expose a view-all control`);
    assert.match(source, /Show featured services/, `${file} should let users return to the curated set`);
  }
});

test("bold hero keeps editorial scale controlled", async () => {
  const source = await readFile("src/components/templates/heroes/BoldHero.tsx", "utf8");

  assert.doesNotMatch(source, /md:text-8xl/, "Bold hero should not overpower client branding with 8xl desktop text");
  assert.match(source, /md:text-7xl/, "Bold hero should stay bold while capped at a safer desktop size");
  assert.match(source, /md:text-2xl/, "Bold hero business name should remain more prominent");
});
