import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateRouter isolates home services from stylist orchestration", async () => {
  const router = await readFile("src/components/templates/TemplateRouter.tsx", "utf8");
  assert.match(router, /business_type\s*===\s*["']home_services["']/);
  assert.match(router, /<HomeServicesTemplate/);
  assert.match(router, /<TemplateOrchestrator/);
});

test("home-services components contain no booking imports or labels", async () => {
  const files = [
    "HomeServicesTemplate.tsx",
    "HomeServicesNav.tsx",
    "HomeServicesHero.tsx",
    "HomeServicesTrustStrip.tsx",
    "HomeServicesServices.tsx",
    "HomeServicesGallery.tsx",
    "HomeServicesWhyUs.tsx",
    "HomeServicesReviews.tsx",
    "HomeServicesServiceAreas.tsx",
    "HomeServicesMobileActionBar.tsx",
    "HomeServicesFooter.tsx",
  ];
  const source = (await Promise.all(files.map((name) =>
    readFile(`src/components/templates/home-services/${name}`, "utf8")
  ))).join("\n");
  assert.doesNotMatch(source, /TemplateBooking|CustomerBookingFlow|Book Now|bookingMode|deposit/i);
});

test("marketing previews switch the home-services locale without leaving the preview", async () => {
  const preview = await readFile(
    "src/app/(marketing)/preview/[slug]/PreviewClient.tsx",
    "utf8",
  );
  const router = await readFile("src/components/templates/TemplateRouter.tsx", "utf8");
  const nav = await readFile(
    "src/components/templates/home-services/HomeServicesNav.tsx",
    "utf8",
  );

  assert.match(preview, /onHomeServicesLocaleChange=\{setLocale\}/);
  assert.match(router, /onHomeServicesLocaleChange/);
  assert.match(nav, /onLocaleChange/);
});

test("all estimate CTAs share the modal controller and delivery boundary is explicit", async () => {
  const names = ["HomeServicesTemplate.tsx", "HomeServicesNav.tsx", "HomeServicesHero.tsx", "HomeServicesServices.tsx", "HomeServicesMobileActionBar.tsx"];
  const source = (await Promise.all(names.map((name) => readFile(`src/components/templates/home-services/${name}`, "utf8")))).join("\n");
  const preview = await readFile("src/app/(marketing)/preview/[slug]/PreviewClient.tsx", "utf8");
  const tenant = await readFile("src/app/site/[slug]/SiteClient.tsx", "utf8");
  assert.match(source, /onEstimate/);
  assert.doesNotMatch(source, /estimateHref|#estimate/);
  assert.match(preview, /estimateDeliveryMode=["']preview_mock["']/);
  assert.match(tenant, /estimateDeliveryMode=["']tenant["']/);
});
