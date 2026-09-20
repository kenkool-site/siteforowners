import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { GuestMessageComposer } from "./GuestMessageComposer";
import type { InvitationBroadcast } from "@/lib/invitations/types";

Object.assign(globalThis, { React });

async function withComposer(
  fetchImpl: typeof fetch,
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test" });
  // Includes "self" beyond ResponsesDashboard.interaction.test.tsx's list:
  // GuestMessageComposer renders a next/link Link (the back link), and
  // next/link's prefetch-on-visibility effect (useIntersection) calls
  // requestIdleCallback, which references the bare `self` global. jsdom's
  // window exposes `self` (self === window per WindowOrWorkerGlobalScope),
  // so assigning it here is enough to satisfy that effect.
  const names = ["window", "document", "self", "HTMLElement", "HTMLInputElement", "HTMLFormElement", "Event", "DOMException", "AbortController", "fetch", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    self: dom.window,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    Event: dom.window.Event,
    DOMException: dom.window.DOMException,
    AbortController: dom.window.AbortController,
    fetch: fetchImpl,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
          <GuestMessageComposer
            eventId="event-1"
            eventName="Mercy & John"
            backHref="/invitations/manage/event-1"
            initialRecipientCounts={{ email: 8, sms: 5 }}
            initialTotalResponses={10}
            initialHistory={[]}
          />
        </NextIntlClientProvider>,
      );
      await Promise.resolve();
    });
    await run(container, dom);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, name) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

test("selecting a template fills in subject and body, and sending posts the composed message", async () => {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const sentBroadcast: InvitationBroadcast = {
    id: "broadcast-1",
    eventId: "event-1",
    channel: "email",
    subject: "Thank you for celebrating with us!",
    body: "Thank you so much for being part of our special day. It meant the world to have you there.",
    sentBy: "owner",
    recipientCount: 8,
    sentCount: 8,
    failedCount: 0,
    suppressedCount: 0,
    createdAt: "2026-09-20T12:00:00.000Z",
  };

  await withComposer(async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
    return {
      ok: true,
      json: async () => ({ ok: true, broadcast: sentBroadcast, recipientCount: 8, sentCount: 8, failedCount: 0, suppressedCount: 0 }),
    } as Response;
  }, async (container, dom) => {
    dom.window.confirm = () => true;

    const thankYouButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Thank you")!;
    assert.ok(thankYouButton, "expected a Thank you template button");
    await act(async () => { thankYouButton.click(); });

    const subjectInput = container.querySelector<HTMLInputElement>("input:not([type='radio'])");
    assert.ok(subjectInput, "expected a subject text input");
    assert.ok(subjectInput.value.length > 0, "expected the template to fill the subject field");

    const sendButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Send message")!;
    assert.ok(sendButton, "expected a Send message button");
    await act(async () => {
      sendButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "expected a POST to the messages endpoint");
    const posted = JSON.parse(postCall!.body!);
    assert.equal(posted.channel, "email");
    assert.ok(posted.subject.length > 0);

    assert.match(container.textContent ?? "", /Sent to 8/);
  });
});

test("a long SMS body shows a segment-count warning; a short one and email don't", async () => {
  await withComposer(async () => ({ ok: true, json: async () => ({}) }) as Response, async (container) => {
    const smsRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Text message"))!;
    assert.ok(smsRadio, "expected an SMS channel radio");
    await act(async () => { smsRadio.click(); });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!;

    await act(async () => {
      setValue.call(textarea, "short body");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.doesNotMatch(container.textContent ?? "", /segment/i, "a short SMS body should not show a segment warning");

    await act(async () => {
      setValue.call(textarea, "x".repeat(200));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(container.textContent ?? "", /2 message segments/i, "a 200-character body (>160) should warn it spans 2 segments");

    const emailRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Email"))!;
    await act(async () => { emailRadio.click(); });
    assert.doesNotMatch(container.textContent ?? "", /segment/i, "email channel should never show an SMS segment warning");
  });
});
