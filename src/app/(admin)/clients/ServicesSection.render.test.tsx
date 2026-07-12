// Lives one level above ./[tenantId]/edit/ on purpose: node's test runner
// treats CLI args as glob patterns, so a path containing [tenantId] is read
// as a character class and the file silently never runs.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import type { ServicesSection as ServicesSectionFn, EditorDraft } from "./[tenantId]/edit/HomeServicesSiteEditor";

// tsx compiles JSX with the classic runtime; React must be in scope globally
// (same pattern as HomeServicesEstimateForm.render.test.tsx).
(globalThis as Record<string, unknown>).React = React;

function emptyLocaleCopy() {
  return {
    hero_headline: "",
    hero_subheadline: "",
    about_paragraphs: [],
    seo_title: "",
    seo_description: "",
    footer_tagline: "",
    google_business_description: "",
    service_descriptions: {},
  };
}

function buildDraft(): EditorDraft {
  return {
    business_name: "Blue Valley",
    phone: "",
    color_theme: "home_services_neighborhood" as EditorDraft["color_theme"],
    services: [{ name: "Lawn", client_id: "stable-id-1", price: "" }],
    images: [],
    hero_video_url: null,
    gallery_video_url: null,
    gallery_video_title: "",
    about_image_url: null,
    generated_copy: {
      en: emptyLocaleCopy(),
      es: emptyLocaleCopy(),
      section_settings: {},
    },
    home_services_config: parseHomeServicesConfig({}),
  };
}

function Harness({
  Section,
  initial,
  onDraft,
}: {
  Section: typeof ServicesSectionFn;
  initial: EditorDraft;
  onDraft: (d: EditorDraft) => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  return (
    <Section
      draft={draft}
      contentLocale="en"
      tenantId="t1"
      onChange={(next) => {
        onDraft(next);
        setDraft(next);
      }}
      onImageChange={() => {}}
    />
  );
}

test("typing in the service name keeps the same input mounted and focused, and client_id stays stable", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost",
  });
  const globalNames = ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  try {
    let latestDraft: EditorDraft | null = null;
    const container = dom.window.document.getElementById("root")!;
    // react-dom (and the editor module graph, which pulls it in) feature-detects
    // the DOM at import time — import both only after the JSDOM globals are
    // installed (same principle as the estimate-form test).
    const { createRoot } = await import("react-dom/client");
    const { ServicesSection } = await import("./[tenantId]/edit/HomeServicesSiteEditor");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness Section={ServicesSection} initial={buildDraft()} onDraft={(d) => (latestDraft = d)} />,
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[type="text"]');
    assert.ok(input, "service name input should render");
    assert.equal(input!.value, "Lawn");
    input!.focus();
    assert.equal(dom.window.document.activeElement, input);

    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!
        .set!.call(input, "Lawns");
      input!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });

    const inputAfter = container.querySelector<HTMLInputElement>('input[type="text"]');
    assert.equal(inputAfter, input, "input must not be remounted while typing");
    assert.equal(dom.window.document.activeElement, input, "input must keep focus while typing");
    assert.equal(latestDraft!.services[0]!.name, "Lawns");
    assert.equal(
      latestDraft!.services[0]!.client_id,
      "stable-id-1",
      "client_id must not be regenerated on rename",
    );

    await act(async () => {
      root.unmount();
    });
  } finally {
    originals.forEach((desc, name) => {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
});
