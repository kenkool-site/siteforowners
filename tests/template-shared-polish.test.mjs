import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  nav: "src/components/templates/SiteNav.tsx",
  footer: "src/components/templates/TemplateFooter.tsx",
  contact: "src/components/templates/TemplateContact.tsx",
  products: "src/components/templates/TemplateProducts.tsx",
  booking: "src/components/templates/TemplateBooking.tsx",
  animation: "src/components/templates/shared/AnimateSection.tsx",
};

test("shared client template components expose polished visual surfaces", async () => {
  const nav = await readFile(files.nav, "utf8");
  const footer = await readFile(files.footer, "utf8");
  const contact = await readFile(files.contact, "utf8");
  const products = await readFile(files.products, "utf8");
  const booking = await readFile(files.booking, "utf8");
  const animation = await readFile(files.animation, "utf8");

  assert.match(nav, /backdrop-blur-xl/, "SiteNav should use a premium glass surface");
  assert.match(nav, /rounded-\[1\.25rem\]/, "SiteNav drawer should use a softened panel radius");
  assert.match(footer, /rounded-\[2rem\]/, "TemplateFooter should use card-like contact/hour surfaces");
  assert.match(contact, /rounded-\[2rem\]/, "TemplateContact should render a polished form card");
  assert.match(products, /rounded-\[1\.5rem\]/, "TemplateProducts should render premium product cards");
  assert.match(booking, /rounded-\[2rem\]/, "TemplateBooking should render a premium booking shell");
  assert.match(animation, /cubicBezier/, "AnimateSection should use a smoother shared easing curve");
});

test("template polish preserves booking behavior hooks and generated-copy contracts", async () => {
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");
  const booking = await readFile(files.booking, "utf8");

  for (const marker of [
    "buildAcuityDeepLink",
    "siteforowners:open-booking-calendar",
    "siteforowners:request-booking-choice",
    "booking_categories",
    "section_settings",
    "template_override",
  ]) {
    assert.match(
      `${orchestrator}\n${booking}`,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `template polish should preserve ${marker}`,
    );
  }
});
