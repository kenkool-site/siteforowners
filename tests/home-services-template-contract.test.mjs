import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateRouter isolates home services from stylist orchestration", async () => {
  const router = await readFile(
    "src/components/templates/TemplateRouter.tsx",
    "utf8",
  );
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
  const source = (
    await Promise.all(
      files.map((name) =>
        readFile(`src/components/templates/home-services/${name}`, "utf8"),
      ),
    )
  ).join("\n");
  assert.doesNotMatch(
    source,
    /TemplateBooking|CustomerBookingFlow|Book Now|bookingMode|deposit/i,
  );
});

test("marketing previews switch the home-services locale without leaving the preview", async () => {
  const preview = await readFile(
    "src/app/(marketing)/preview/[slug]/PreviewClient.tsx",
    "utf8",
  );
  const router = await readFile(
    "src/components/templates/TemplateRouter.tsx",
    "utf8",
  );
  const nav = await readFile(
    "src/components/templates/home-services/HomeServicesNav.tsx",
    "utf8",
  );

  assert.match(preview, /onHomeServicesLocaleChange=\{setLocale\}/);
  assert.match(router, /onHomeServicesLocaleChange/);
  assert.match(nav, /onLocaleChange/);
});

test("all estimate CTAs share the modal controller and delivery boundary is explicit", async () => {
  const names = [
    "HomeServicesTemplate.tsx",
    "HomeServicesNav.tsx",
    "HomeServicesHero.tsx",
    "HomeServicesServices.tsx",
    "HomeServicesMobileActionBar.tsx",
  ];
  const source = (
    await Promise.all(
      names.map((name) =>
        readFile(`src/components/templates/home-services/${name}`, "utf8"),
      ),
    )
  ).join("\n");
  const preview = await readFile(
    "src/app/(marketing)/preview/[slug]/PreviewClient.tsx",
    "utf8",
  );
  const tenant = await readFile("src/app/site/[slug]/SiteClient.tsx", "utf8");
  assert.match(source, /onEstimate/);
  assert.doesNotMatch(source, /estimateHref|#estimate/);
  assert.match(preview, /estimateDeliveryMode=["']preview_mock["']/);
  assert.match(tenant, /estimateDeliveryMode=["']tenant["']/);
});

test("estimate modal preserves accessible validation and upload contracts", async () => {
  const form = await readFile(
    "src/components/templates/home-services/HomeServicesEstimateForm.tsx",
    "utf8",
  );
  const photoSelection = await readFile(
    "src/components/templates/home-services/estimate-photo-selection.ts",
    "utf8",
  );
  const english = JSON.parse(await readFile("messages/en.json", "utf8"));
  const spanish = JSON.parse(await readFile("messages/es.json", "utf8"));

  assert.match(form, /estimate\.modal\.optional/g);
  assert.match(form, /company_website/);
  assert.match(form, /aria-invalid/);
  assert.match(form, /aria-describedby/);
  assert.match(form, /validateEstimatePhotoSelection\(photos\)/);
  assert.match(form, /selectEstimatePhotos\(/);
  assert.match(photoSelection, /ESTIMATE_PHOTO_LIMITS\.maxFiles/);
  assert.match(photoSelection, /ESTIMATE_PHOTO_LIMITS\.maxBytesPerFile/);
  assert.match(photoSelection, /ESTIMATE_PHOTO_LIMITS\.maxTotalBytes/);
  assert.match(form, /response\.status === 429/);
  assert.match(form, /response\.status === 503/);
  assert.match(form, /deliveryMode === "preview_mock"/);
  assert.equal(english.homeServices.estimate.modal.optional, "Optional");
  assert.equal(spanish.homeServices.estimate.modal.optional, "Opcional");
});

test("richer homepage follows the approved conversion-story order", async () => {
  const source = await readFile("src/components/templates/home-services/HomeServicesTemplate.tsx", "utf8");
  const order = ["HomeServicesHero", "HomeServicesTrustStrip", "HomeServicesServices", "HomeServicesGallery", "HomeServicesProcess", "HomeServicesProofAndAreas", "HomeServicesFinalCta", "HomeServicesFooter"];
  let cursor = -1;
  for (const component of order) {
    const next = source.indexOf(`<${component}`, cursor + 1);
    assert.ok(next > cursor, `${component} should follow the prior public section`);
    cursor = next;
  }
  assert.match(source, /const onEstimate = .*dispatchEstimate/);
  assert.match(source, /<HomeServicesServices[\s\S]*onEstimate=\{onEstimate\}/);
  assert.match(source, /<HomeServicesFinalCta[\s\S]*onEstimate=\{/);
});

test("process and proof composition expose responsive semantic contracts", async () => {
  const process = await readFile("src/components/templates/home-services/HomeServicesProcess.tsx", "utf8");
  const proof = await readFile("src/components/templates/home-services/HomeServicesProofAndAreas.tsx", "utf8");
  const areas = await readFile("src/components/templates/home-services/HomeServicesServiceAreas.tsx", "utf8");
  assert.match(process, /<ol/);
  assert.match(process, /grid-cols-1 md:grid-cols-3/);
  assert.match(proof, /grid-cols-1/);
  assert.match(proof, /lg:grid-cols-2/);
  assert.match(proof, /hasReviews && hasServiceAreas/);
  assert.match(areas, /<ul/);
  assert.match(areas, /area\.zip_codes\.join\(/);
  assert.match(areas, /coverageSummary/);
});

test("hero coverage and final CTA avoid addresses and reuse estimate callback", async () => {
  const hero = await readFile("src/components/templates/home-services/HomeServicesHero.tsx", "utf8");
  const cta = await readFile("src/components/templates/home-services/HomeServicesFinalCta.tsx", "utf8");
  assert.match(hero, /serviceAreaNames\.slice\(0, 3\)/);
  assert.doesNotMatch(hero, /address/i);
  assert.match(cta, /phoneHref &&/);
  assert.match(cta, /messageHref &&/);
  assert.match(cta, /onClick=\{onEstimate\}/);
});
