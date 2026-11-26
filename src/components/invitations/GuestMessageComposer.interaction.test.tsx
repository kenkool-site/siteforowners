import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import type { BroadcastRecipientChoice } from "@/lib/invitations/broadcasts";
import { buildMessageTemplateValues } from "@/lib/invitations/message-templates";
import { GuestMessageComposer } from "./GuestMessageComposer";
import type { InvitationBroadcast } from "@/lib/invitations/types";

const templateValues = buildMessageTemplateValues({
  locale: "en",
  title: "You're Invited",
  honoreeNames: "Mercy and John",
  slug: "mercy-john",
  publicSubdomain: "mercy-john",
  startsAt: "2026-12-19T19:00:00.000Z",
  timezone: "America/New_York",
  venueName: "The Bliss",
  address: "100 Main St",
  mapUrl: null,
  rsvpDeadline: null,
  styleGuide: { note: "traditional aso-ebi", colors: [{ name: "gold", color: "#C5A046" }] },
  additionalSections: [],
});

Object.assign(globalThis, { React });

const defaultRecipients: { email: BroadcastRecipientChoice[]; sms: BroadcastRecipientChoice[] } = {
  email: [
    { id: "r1", name: "Wunmi Adeniji", contact: "w•••@example.test", status: "attending" },
    { id: "r2", name: "Ada Lovelace", contact: "a•••@example.test", status: "declined" },
  ],
  sms: [
    { id: "r1", name: "Wunmi Adeniji", contact: "••• ••• 4567", status: "attending" },
  ],
};

async function withComposer(
  fetchImpl: typeof fetch,
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
  recipients = defaultRecipients,
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
            templateValues={templateValues}
            eventStartsAt="2026-12-19T19:00:00.000Z"
            eventTimezone="America/New_York"
            now={new Date("2026-12-07T16:00:00.000Z")}
            emailBudget={{ limit: 1000, remaining: 1000 }}
            smsBudget={{ limit: 500, remaining: 500 }}
            recipients={recipients}
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

    const subjectInput = container.querySelector<HTMLInputElement>("input[name='subject']");
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
    assert.deepEqual(posted.recipientIds, ["r1", "r2"]);

    assert.match(container.textContent ?? "", /Sent to 8/);
    assert.doesNotMatch(container.textContent ?? "", /guest email limit/);
  });
});

test("a send blocked by the guest email limit says so instead of a generic messaging limit", async () => {
  await withComposer(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      broadcast: {
        id: "broadcast-limited",
        eventId: "event-1",
        channel: "email",
        subject: "Hello",
        body: "Hello there",
        sentBy: "owner",
        recipientCount: 1,
        sentCount: 0,
        failedCount: 0,
        suppressedCount: 1,
        createdAt: "2026-09-20T12:00:00.000Z",
      },
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 1,
      emailBudget: { limit: 1000, remaining: 0 },
    }),
  }) as Response, async (container, dom) => {
    dom.window.confirm = () => true;
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const subject = container.querySelector<HTMLInputElement>("input[name='subject']")!;
    const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      setValue(subject, "Hello");
      setValue(textarea, "Hello there");
    });
    const sendButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Send message")!;
    await act(async () => {
      sendButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(container.textContent ?? "", /Skipped 1 because this event is at its guest email limit/);
    assert.doesNotMatch(container.textContent ?? "", /messaging limit/);
    assert.match(container.textContent ?? "", /0 of 1000 guest emails left/);
  });
});

test("selecting a template inserts host, date, and venue, and SMS uses the short version", async () => {
  await withComposer(async () => ({ ok: true, json: async () => ({}) }) as Response, async (container) => {
    const reminderButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Reminder")!;
    assert.ok(reminderButton, "expected a Reminder template button");
    await act(async () => { reminderButton.click(); });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    assert.match(textarea.value, /Mercy and John/);
    assert.match(textarea.value, /The Bliss/);
    assert.match(textarea.value, /mercy-john\.invitespot\.app/);
    assert.match(textarea.value, /Hi \{guest_name\},/);
    assert.match(textarea.value, /\{days_to_go\}/);
    assert.match(textarea.value, /Just \{days_to_go\} until our celebration/);
    assert.doesNotMatch(textarea.value, /You're Invited/);
    const emailPreview = container.querySelector("[data-message-preview]")?.textContent ?? "";
    assert.match(emailPreview, /Hi Wunmi,\s+Just 12 days to go until our celebration\. We would love to see you there\./);
    assert.doesNotMatch(emailPreview, /\{days_to_go\}/);
    const subjectPreview = container.querySelector("[data-subject-preview]")?.textContent ?? "";
    assert.match(subjectPreview, /A reminder from Mercy and John: 12 days to go/);
    assert.doesNotMatch(subjectPreview, /\{days_to_go\}/);

    const smsRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Text message"))!;
    await act(async () => { smsRadio.click(); });
    assert.match(container.textContent ?? "", /500 of 500 guest texts left/);
    assert.match(textarea.value, /Hi \{guest_name\},/);
    assert.match(textarea.value, /\{days_to_go\}/);
    assert.match(textarea.value, /The Bliss/);
    assert.match(textarea.value, /- Mercy and John/);
    assert.match(container.textContent ?? "", /\{guest_name\} is replaced with each guest name\. This preview uses Wunmi\./);
    assert.match(container.textContent ?? "", /\{days_to_go\} is filled in when you send, from this event date\. This preview uses 12 days to go\./);
    assert.match(container.textContent ?? "", /Every text adds a blank line, then: Reply STOP to opt out/);
    assert.match(container.textContent ?? "", /including the line below/);
    const reminderPreview = container.querySelector("[data-sms-preview]")?.textContent ?? "";
    assert.match(reminderPreview, /Hi Wunmi, just 12 days to go until our celebration/);
    assert.doesNotMatch(reminderPreview, /\{days_to_go\}/);
    assert.match(reminderPreview, /\n\nReply STOP to opt out/);
    assert.equal(reminderPreview.split("Reply STOP to opt out").length, 2);

    const photos = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Share photos")!;
    await act(async () => { photos.click(); });
    assert.match(textarea.value, /https:\/\/mercy-john\.invitespot\.app\/memories/);
    assert.match(textarea.value, /\{guest_name\}/);
    const photoPreview = container.querySelector("[data-sms-preview]")?.textContent ?? "";
    assert.match(photoPreview, /Hi Wunmi, thank you for celebrating with us!/);
    assert.match(photoPreview, /https:\/\/mercy-john\.invitespot\.app\/memories/);
    assert.match(photoPreview, /\n\nReply STOP to opt out/);

    const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!;
    await act(async () => {
      setValue.call(textarea, "Custom note for guests");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const emailRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Email"))!;
    await act(async () => { emailRadio.click(); });
    assert.equal(textarea.value, "Custom note for guests");
  });
});

test("the days chip inserts the token and the preview shows the countdown", async () => {
  await withComposer(async () => ({ ok: true, json: async () => ({}) }) as Response, async (container) => {
    const chip = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "{days_to_go}");
    assert.ok(chip, "expected a {days_to_go} insert chip");
    await act(async () => { chip.click(); });
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    assert.equal(textarea.value, "{days_to_go}");
    const preview = container.querySelector("[data-message-preview]")?.textContent ?? "";
    assert.match(preview, /12 days to go/);
    assert.doesNotMatch(preview, /\{days_to_go\}/);
    assert.match(container.textContent ?? "", /\{days_to_go\} is filled in when you send/);
  });
});

test("clearing one guest sends only the guests who stay selected", async () => {
  const calls: Array<{ method?: string; body?: string }> = [];
  await withComposer(async (_input, init) => {
    calls.push({ method: init?.method, body: init?.body as string | undefined });
    return { ok: true, json: async () => ({ ok: true, broadcast: {
      id: "broadcast-2", eventId: "event-1", channel: "email", subject: "Hi", body: "Hello there",
      sentBy: "owner", recipientCount: 1, sentCount: 1, failedCount: 0, suppressedCount: 0,
      createdAt: "2026-09-20T12:00:00.000Z",
    }, sentCount: 1, failedCount: 0, suppressedCount: 0 }) } as Response;
  }, async (container, dom) => {
    dom.window.confirm = () => true;
    const ada = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Ada Lovelace"));
    const checkbox = ada?.querySelector<HTMLInputElement>("input[type='checkbox']");
    assert.ok(checkbox?.checked);
    await act(async () => { checkbox?.click(); });
    assert.match(container.textContent ?? "", /reach 1 of 10 guests/i);

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const subject = container.querySelector<HTMLInputElement>("input[name='subject']")!;
    const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      setValue(subject, "Hello");
      setValue(textarea, "Hello there");
    });
    const sendButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Send message")!;
    await act(async () => { sendButton.click(); await Promise.resolve(); });
    const posted = JSON.parse(calls.find((call) => call.method === "POST")!.body!);
    assert.deepEqual(posted.recipientIds, ["r1"]);
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

test("the character count includes the opt-out line once, and a message that only fits without it warns", async () => {
  await withComposer(async () => ({ ok: true, json: async () => ({}) }) as Response, async (container) => {
    const smsRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Text message"))!;
    await act(async () => { smsRadio.click(); });
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!;

    const already = "Hello\nReply STOP to opt out";
    await act(async () => {
      setValue.call(textarea, already);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(container.textContent ?? "", new RegExp(`${already.length} characters, including the line below`));
    assert.doesNotMatch(container.textContent ?? "", /49 characters/);

    await act(async () => {
      setValue.call(textarea, "x".repeat(150));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(container.textContent ?? "", /173 characters, including the line below/);
    assert.match(container.textContent ?? "", /2 message segments/i);
  });
});

test("an opted-out guest is unavailable for text, left out of the count, and cannot be sent", async () => {
  const calls: Array<{ method?: string; body?: string }> = [];
  const recipients = {
    email: defaultRecipients.email,
    sms: [
      { id: "r1", name: "Wunmi Adeniji", contact: "••• ••• 4567", status: "attending" as const },
      { id: "r3", name: "Opted Guest", contact: "••• ••• 0100", status: "attending" as const, optedOut: true },
    ],
  };
  await withComposer(async (_input, init) => {
    calls.push({ method: init?.method, body: init?.body as string | undefined });
    return { ok: true, json: async () => ({ ok: true, broadcast: {
      id: "broadcast-3", eventId: "event-1", channel: "sms", subject: null, body: "Hello there",
      sentBy: "owner", recipientCount: 1, sentCount: 1, failedCount: 0, suppressedCount: 0,
      createdAt: "2026-09-20T12:00:00.000Z",
    }, sentCount: 1, failedCount: 0, suppressedCount: 0 }) } as Response;
  }, async (container, dom) => {
    dom.window.confirm = () => true;
    const smsRadio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']"))
      .find((input) => input.parentElement?.textContent?.includes("Text message"))!;
    await act(async () => { smsRadio.click(); });

    assert.match(container.textContent ?? "", /Opted out/);
    assert.match(container.textContent ?? "", /1 guest opted out of texts and is not included/);
    assert.match(container.textContent ?? "", /1 selected/);
    assert.match(container.textContent ?? "", /reach 1 of 10 guests/i);
    const opted = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Opted Guest"));
    const checkbox = opted?.querySelector<HTMLInputElement>("input[type='checkbox']");
    assert.equal(checkbox?.disabled, true);
    assert.equal(checkbox?.checked, false);

    const selectAll = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Select all")!;
    await act(async () => { selectAll.click(); });
    assert.equal(checkbox?.checked, false);

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value")!.set!;
    await act(async () => {
      setValue.call(textarea, "Hello there");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const sendButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Send message")!;
    await act(async () => { sendButton.click(); await Promise.resolve(); });
    const posted = JSON.parse(calls.find((call) => call.method === "POST")!.body!);
    assert.equal(posted.channel, "sms");
    assert.deepEqual(posted.recipientIds, ["r1"]);
  }, recipients);
});
