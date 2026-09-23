import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import "fake-indexeddb/auto";
import enMessages from "../../../../messages/en.json";

(globalThis as Record<string, unknown>).React = React;

test("memories opens on the gallery with upload as an action instead of a destination", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  const keys = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/session")) return new Response(JSON.stringify({ level: "anonymous", guestName: null }), { status: 200 });
    if (url.endsWith("/gallery")) return new Response(JSON.stringify({ media: [], moments: [] }), { status: 200 });
    return new Response(null, { status: 404 });
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    fetch: fetchMock,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const { createRoot } = await import("react-dom/client");
  const { GuestMemoriesApp } = await import("./GuestMemoriesApp");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestMemoriesApp eventId="event-1" eventTitle="Mercy & John" accent="#275B35" background="#FAF8F1" text="#16351F" surface="#EEF1E8" />
        </NextIntlClientProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const content = dom.window.document.body.textContent ?? "";
    assert.match(content, /Mercy & John/);
    assert.match(content, /Add your photos/);
    assert.match(content, /Gallery/);
    assert.match(content, /Moments/);
    assert.doesNotMatch(content, /Add photosGallery/);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]);
  }
});
