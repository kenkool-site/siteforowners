import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";

(globalThis as Record<string, unknown>).React = React;

test("the floating RSVP action locks background scroll and Escape restores it", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test" });
  const names = ["window", "document", "HTMLElement", "HTMLButtonElement", "KeyboardEvent", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, KeyboardEvent: dom.window.KeyboardEvent, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  Object.defineProperty(dom.window, "scrollY", { value: 240, configurable: true });
  const scrollCalls: Array<[number, number]> = [];
  dom.window.scrollTo = ((x: number, y: number) => { scrollCalls.push([x, y]); }) as typeof dom.window.scrollTo;

  const { createRoot } = await import("react-dom/client");
  const { InvitationRsvpDialog } = await import("./InvitationRsvpDialog");
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC"><InvitationRsvpDialog slug="ana-and-luis" state="published" preview deadlineDate="September 30, 2026" showPublicRsvpCount={false} accent="#B58A55" background="#FCFBF7" foreground="#172238" /></NextIntlClientProvider>));
    assert.equal(container.querySelector('[role="dialog"]'), null);
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.ok(dialog);
    assert.match(dialog.textContent ?? "", /Please RSVP by September 30, 2026/);
    assert.ok(container.querySelector('input[name="primaryName"]'));
    assert.equal(dom.window.document.body.style.position, "fixed");
    assert.equal(dom.window.document.body.style.top, "-240px");
    assert.match(dialog.className, /overflow-y-auto/);
    assert.match(dialog.parentElement?.className ?? "", /overscroll-contain/);
    await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(dom.window.document.body.style.position, "");
    assert.equal(dom.window.document.body.style.top, "");
    assert.deepEqual(scrollCalls, [[0, 240]]);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, name) => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete (globalThis as Record<string, unknown>)[name]);
  }
});
