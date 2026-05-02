import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  orchestrator: "src/components/templates/TemplateOrchestrator.tsx",
  services: "src/components/templates/services/RunwayServices.tsx",
  gallery: "src/components/templates/galleries/RunwayGallery.tsx",
  cta: "src/components/templates/RunwayBookingCTA.tsx",
};

test("runway template keeps service categories, service images, and booking CTAs live-data safe", async () => {
  const orchestrator = await readFile(files.orchestrator, "utf8");
  const services = await readFile(files.services, "utf8");
  const cta = await readFile(files.cta, "utf8");

  assert.match(orchestrator, /<RunwayServices[\s\S]*categories=\{categories\}/, "Runway services should receive existing categories data");
  assert.match(services, /groupServices\(services as unknown as ServiceItem\[\], categories\)/, "Runway should preserve category grouping");
  assert.match(services, /import Image from "next\/image"/, "service images should use Next Image instead of raw img");
  assert.doesNotMatch(services, /<img[\s>]/, "Runway service cards should not use raw img tags");
  assert.match(services, /openBookingCalendarForService/, "in-site booking CTA behavior should stay intact");
  assert.match(services, /requestBookingChoice/, "dual booking mode CTA behavior should stay intact");
  assert.match(cta, /href="#booking"/, "Runway CTA should keep pointing to the existing booking section");
});

test("runway gallery renders a polished lookbook without dropping uploaded gallery images", async () => {
  const gallery = await readFile(files.gallery, "utf8");

  assert.doesNotMatch(gallery, /images\.slice\(0,\s*6\)/, "Runway gallery should not silently drop images after the sixth upload");
  assert.match(gallery, /TILE_CLASSES\[index % TILE_CLASSES\.length\]/, "Runway gallery should cycle editorial tile classes for all images");
  assert.match(gallery, /href="#booking"/, "Runway gallery should include a booking CTA near finished looks");
});

test("runway moving text is generated from client services and categories", async () => {
  const orchestrator = await readFile(files.orchestrator, "utf8");

  assert.match(orchestrator, /runwayMarqueeItems\s*=/, "Runway should build marquee items before rendering");
  assert.match(orchestrator, /categories\.slice\(0,\s*3\)/, "Runway marquee should include client categories when available");
  assert.match(orchestrator, /services\.slice\(0,\s*4\)/, "Runway marquee should include client services when available");
  assert.match(orchestrator, /Book Your Look/, "Runway marquee should keep a booking-oriented CTA phrase");
});

test("runway keeps long service lists premium instead of rendering a wall", async () => {
  const services = await readFile(files.services, "utf8");

  assert.match(services, /INITIAL_FLAT_SERVICE_LIMIT\s*=\s*9/, "flat long lists should initially show a curated first set");
  assert.match(services, /INITIAL_GROUP_SERVICE_LIMIT\s*=\s*6/, "large categories should initially show a curated first set");
  assert.match(services, /visibleServices\s*=\s*shouldLimitGroup/, "Runway should render a capped visible service collection first");
  assert.match(services, /View all \{group\.services\.length\} services/, "Runway should offer an explicit view-all control");
  assert.match(services, /Show featured services/, "Runway should let users collapse back to the premium featured set");
});

test("runway marquee and gallery CTAs stay concise and booking-oriented", async () => {
  const orchestrator = await readFile(files.orchestrator, "utf8");
  const gallery = await readFile(files.gallery, "utf8");

  assert.match(orchestrator, /getRunwayMarqueeLabel/, "Runway should shorten long service names before marquee rendering");
  assert.match(orchestrator, /\.slice\(0,\s*22\)/, "Runway marquee labels should be capped for readability");
  assert.doesNotMatch(gallery, /Book This Energy/, "Gallery CTA should avoid unclear slang on client sites");
  assert.match(gallery, /Book a Look/, "Gallery CTA should clearly point to booking a look");
});
