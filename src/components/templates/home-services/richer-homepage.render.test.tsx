import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { HOME_SERVICES_CONTENT_DEFAULTS, resolveHomeServicesProcessSteps, resolveHomeServicesSectionCopy } from "@/lib/home-services/content-defaults";
import type { PreviewData } from "@/lib/ai/types";
import { HomeServicesFinalCta } from "./HomeServicesFinalCta";
import { HomeServicesProcess } from "./HomeServicesProcess";
import { HomeServicesProofAndAreas } from "./HomeServicesProofAndAreas";
import { HomeServicesServiceAreas } from "./HomeServicesServiceAreas";
import { HomeServicesServices } from "./HomeServicesServices";
import { HomeServicesTemplate } from "./HomeServicesTemplate";

const colors = { primary: "#123456", secondary: "#fedcba", background: "#ffffff", foreground: "#111111", muted: "#eeeeee" } as never;
const copy = resolveHomeServicesSectionCopy("service_areas");
const areas = [{ id: "north", name: "Northside", zip_codes: ["10001", "10002"], note_en: "Same-day visits", note_es: "Visitas el mismo día" }];
const reviews = [{ authorName: "A", rating: 5, text: "Excellent" }] as never;
Object.assign(globalThis, { React });

const templateData: PreviewData = {
  business_name: "Neighborhood Repairs",
  business_type: "home_services",
  color_theme: "home_services_neighborhood",
  phone: "2125550100",
  services: [{ client_id: "svc", name: "Roof repair", price: "$100" }],
  images: ["https://example.com/hero.jpg"],
  generated_copy: {
    en: { hero_headline: "Help at home", hero_subheadline: "Local and reliable", about_paragraphs: [], service_descriptions: {}, seo_title: "", seo_description: "", footer_tagline: "", google_business_description: "" },
    es: { hero_headline: "Ayuda en casa", hero_subheadline: "Local y confiable", about_paragraphs: [], service_descriptions: {}, seo_title: "", seo_description: "", footer_tagline: "", google_business_description: "" },
  },
};

function renderTemplate(sections?: Record<string, boolean>) {
  const data = structuredClone(templateData);
  data.generated_copy!.home_services_config = { sections };
  return renderToStaticMarkup(<HomeServicesTemplate data={data} locale="en" estimateDeliveryMode="preview_mock" />);
}

function intl(locale: "en" | "es", child: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="America/New_York">{child}</NextIntlClientProvider>;
}

test("structured areas render the semantic list without the legacy summary", () => {
  const html = renderToStaticMarkup(<HomeServicesServiceAreas coverageSummary="LEGACY EXACT" areas={areas} copy={copy} locale="en" colors={colors} />);
  assert.match(html, /<ul/);
  assert.match(html, /Northside/);
  assert.doesNotMatch(html, /LEGACY EXACT/);
});

test("summary-only coverage is rendered exactly and empty coverage renders nothing", () => {
  const summary = "  Exact legacy coverage copy.  ";
  const html = renderToStaticMarkup(<HomeServicesServiceAreas coverageSummary={summary} areas={[]} copy={copy} locale="en" colors={colors} />);
  assert.ok(html.includes(summary));
  assert.equal(renderToStaticMarkup(<HomeServicesServiceAreas coverageSummary="" areas={[]} copy={copy} locale="en" colors={colors} />), "");
});

test("area ZIPs and notes resolve for the active locale", () => {
  const english = renderToStaticMarkup(<HomeServicesServiceAreas coverageSummary="" areas={areas} copy={copy} locale="en" colors={colors} />);
  const spanish = renderToStaticMarkup(<HomeServicesServiceAreas coverageSummary="" areas={areas} copy={copy} locale="es" colors={colors} />);
  assert.match(english, /10001, 10002/);
  assert.match(english, /Same-day visits/);
  assert.doesNotMatch(english, /Visitas el mismo día/);
  assert.match(spanish, /Visitas el mismo día/);
});

test("proof uses two columns only with both children and full width with one", () => {
  const both = renderToStaticMarkup(intl("en", <HomeServicesProofAndAreas reviews={reviews} areas={areas} rating={5} reviewCount={1} coverageSummary="" copies={{ reviews: resolveHomeServicesSectionCopy("reviews"), serviceAreas: copy }} locale="en" colors={colors} />));
  const one = renderToStaticMarkup(intl("en", <HomeServicesProofAndAreas reviews={reviews} areas={[]} rating={5} reviewCount={1} coverageSummary="" copies={{ reviews: resolveHomeServicesSectionCopy("reviews"), serviceAreas: copy }} locale="en" colors={colors} />));
  assert.match(both, /lg:grid-cols-2/);
  assert.doesNotMatch(one, /lg:grid-cols-2/);
});

test("default process is bilingual and responsive", () => {
  const steps = resolveHomeServicesProcessSteps([]);
  assert.deepEqual(steps, HOME_SERVICES_CONTENT_DEFAULTS.process_steps);
  const english = renderToStaticMarkup(<HomeServicesProcess steps={steps} copy={resolveHomeServicesSectionCopy("process")} locale="en" colors={colors} />);
  const spanish = renderToStaticMarkup(<HomeServicesProcess steps={steps} copy={resolveHomeServicesSectionCopy("process")} locale="es" colors={colors} />);
  assert.match(english, /grid-cols-1 md:grid-cols-3/);
  assert.ok(english.includes(steps[0].title_en));
  assert.ok(spanish.includes(steps[0].title_es));
});

test("HomeServicesTemplate renders process by default/true and omits it when configured false", () => {
  assert.match(renderTemplate(), /id="process-heading"/);
  assert.match(renderTemplate({ show_process: true }), /id="process-heading"/);
  assert.doesNotMatch(renderTemplate({ show_process: false }), /id="process-heading"/);
});

test("375px render preserves mobile DOM order, stacking hooks, and 44px action hooks", () => {
  const dom = new JSDOM(renderTemplate(), { url: "http://localhost" });
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 375 });
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  const document = dom.window.document;
  assert.equal(dom.window.innerWidth, 375);
  const services = document.querySelector("#services")!;
  const process = document.querySelector("#process-heading")!.closest("section")!;
  assert.ok(services.compareDocumentPosition(process) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.match(process.querySelector(".grid")!.className, /grid-cols-1/);
  const actions = Array.from(document.querySelectorAll("button, a")).filter((node) => node.className.includes("min-h-11"));
  assert.ok(actions.length >= 3);
  assert.ok(actions.every((node) => node.className.includes("min-h-11")));
  dom.window.close();
});

test("final CTA omits unavailable contact actions, invokes estimate, and stacks 44px controls", async () => {
  let estimates = 0;
  const element = <HomeServicesFinalCta copy={resolveHomeServicesSectionCopy("final_cta")} locale="en" phoneHref={null} messageHref={null} onEstimate={() => { estimates += 1; }} colors={colors} />;
  const html = renderToStaticMarkup(intl("en", element));
  assert.match(html, /min-h-11/);
  assert.match(html, /flex-col[^" ]*|flex flex-col/);
  assert.doesNotMatch(html, /href="tel:|href="sms:|wa\.me/);
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.querySelector("#root")!);
  await act(async () => root.render(intl("en", element)));
  await act(async () => document.querySelector("button")!.click());
  assert.equal(estimates, 1);
  await act(async () => root.unmount());
  dom.window.close();
});

test("service estimate keeps the selected service and uses 44px mobile controls", async () => {
  let selected = "";
  const element = <HomeServicesServices services={[{ client_id: "svc", name: "Roof repair" }] as never} serviceDescriptions={{}} locale="en" colors={colors} onEstimate={(name?: string) => { selected = name ?? ""; }} copy={resolveHomeServicesSectionCopy("services")} />;
  const html = renderToStaticMarkup(intl("en", element));
  assert.match(html, /min-h-11/);
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.querySelector("#root")!);
  await act(async () => root.render(intl("en", element)));
  await act(async () => document.querySelector("button")!.click());
  assert.equal(selected, "Roof repair");
  await act(async () => root.unmount());
  dom.window.close();
});
