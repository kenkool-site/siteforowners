import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

(globalThis as Record<string, unknown>).React = React;

async function withHero(url: string, run: (container: HTMLElement, dom: JSDOM, scrolls: Array<[number, number]>) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div><article id='invitation-content'></article></body></html>", { url });
  const names = ["window", "document", "HTMLElement", "HTMLButtonElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const scrolls: Array<[number, number]> = [];
  dom.window.scrollTo = ((x: number, y: number) => { scrolls.push([x, y]); }) as typeof dom.window.scrollTo;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const target = dom.window.document.querySelector<HTMLElement>("#invitation-content")!;
  let contentScrolls = 0;
  target.dataset.scrollCalls = "0";
  target.scrollIntoView = () => {
    contentScrolls += 1;
    target.dataset.scrollCalls = String(contentScrolls);
  };
  const { createRoot } = await import("react-dom/client");
  const { InvitationHero } = await import("./InvitationHero");
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <InvitationHero coverUrl={null} title="You're invited" honoreeNames="Mia and Lee" date="October 10, 2026" venueName="The Garden" venueUrl={null} recipe={DEFAULT_INVITATION_DESIGN_RECIPE} />
      </NextIntlClientProvider>,
    ));
    await run(container, dom, scrolls);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, name) => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete (globalThis as Record<string, unknown>)[name]);
  }
}

test("View invitation scrolls to the details without adding a refresh-persistent hash", async () => {
  await withHero("https://example.test/invite/mia-and-lee", async (container, dom) => {
    const action = Array.from(container.querySelectorAll<HTMLElement>("a,button")).find((element) => element.textContent?.includes("View invitation"));
    assert.ok(action);
    await act(async () => action.click());
    assert.equal(dom.window.location.hash, "");
    assert.equal(dom.window.document.querySelector<HTMLElement>("#invitation-content")?.dataset.scrollCalls, "1");
  });
});

test("loading a legacy invitation hash restores the cover and cleans the URL", async () => {
  await withHero("https://example.test/invite/mia-and-lee#invitation-content", async (_container, dom, scrolls) => {
    assert.equal(dom.window.location.hash, "");
    assert.deepEqual(scrolls.at(-1), [0, 0]);
  });
});
