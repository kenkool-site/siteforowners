import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";

(globalThis as Record<string, unknown>).React = React;

test("guestbook form is compact, text-only, and locks background scrolling", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  const keys = ["window", "document", "HTMLElement", "HTMLButtonElement", "KeyboardEvent", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, KeyboardEvent: dom.window.KeyboardEvent, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.scrollTo = (() => undefined) as typeof dom.window.scrollTo;
  const { createRoot } = await import("react-dom/client");
  const { InvitationCommentWall } = await import("./InvitationCommentWall");
  const root = createRoot(dom.window.document.querySelector("#root")!);
  try {
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC"><InvitationCommentWall slug="mercy-john" initialPage={{ comments: [], nextCursor: null }} preview={false} accent="#275B35" surface="#FFFDF8" foreground="#172238" titleClass="font-serif" /></NextIntlClientProvider>));
    await act(async () => (dom.window.document.querySelector("button") as HTMLButtonElement).click());
    assert.ok(dom.window.document.querySelector('input[name="guestName"]'));
    assert.ok(dom.window.document.querySelector('textarea[name="body"]'));
    assert.equal(dom.window.document.querySelector('input[type="file"]'), null);
    assert.equal(dom.window.document.body.style.position, "fixed");
    await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]);
  }
});
