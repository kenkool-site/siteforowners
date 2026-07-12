import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { HomeServicesHero } from "./HomeServicesHero";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";

// tsx compiles JSX with the classic runtime; React must be in scope globally
// (same pattern as HomeServicesEstimateForm.render.test.tsx).
(globalThis as Record<string, unknown>).React = React;

const colors = THEMES_BY_VERTICAL.home_services[0]!.colors;

function renderHero(serviceAreaNames: string[]): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeServicesHero
        businessName="Blue Valley Landscaping LLC"
        headline="Your Yard. Transformed."
        subheadline="Professional landscaping."
        phoneHref="tel:+15551234567"
        messageHref={null}
        serviceAreaNames={serviceAreaNames}
        onEstimate={() => {}}
        colors={colors}
      />
    </NextIntlClientProvider>,
  );
}

test("hero renders each service area as a chip with no overflow link for few areas", () => {
  const html = renderHero(["Mays Landing, NJ", "Egg Harbor"]);
  assert.ok(html.includes("Mays Landing, NJ"));
  assert.ok(html.includes("Egg Harbor"));
  assert.ok(!html.includes("#service-areas"), "no overflow link expected for 2 areas");
});

test("hero caps chips at 4 areas and links the overflow to the service-areas section", () => {
  const html = renderHero(["Area One", "Area Two", "Area Three", "Area Four", "Area Five", "Area Six"]);
  assert.ok(html.includes("Area One"));
  assert.ok(html.includes("Area Four"));
  assert.ok(!html.includes("Area Five"), "5th area should not render as a chip");
  assert.ok(html.includes('href="#service-areas"'));
  assert.ok(html.includes("+2 more"));
});

test("hero renders no chip row when there are no service areas", () => {
  const html = renderHero([]);
  assert.ok(!html.includes("#service-areas"));
  assert.ok(!html.includes("Serving"));
});
