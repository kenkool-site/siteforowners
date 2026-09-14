import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import type { EditorEvent } from "./EventEditor";

(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

const baseEvent: EditorEvent = {
  id: "event-1",
  ownerId: "owner-1",
  slug: "ana-and-luis",
  eventType: "wedding",
  locale: "en",
  title: "Ana & Luis",
  honoreeNames: "Ana and Luis",
  description: "Join us to celebrate.",
  startsAt: "2026-10-20T22:00:00.000Z",
  endsAt: null,
  timezone: "America/New_York",
  venueName: "The Foundry",
  address: "42 Celebration Way",
  mapUrl: null,
  themeKey: "editorial",
  primaryColor: "#2B2231",
  accentColor: "#6D456F",
  fontPairKey: "fraunces-geist",
  designedInvitePath: "event-1/invite.jpg",
  coverImagePath: null,
  videoPath: null,
  showPublicRsvpCount: false,
  capacity: 120,
  rsvpDeadline: null,
  submissionLimit: 250,
  emailNotificationLimit: 250,
  smsNotificationLimit: 50,
  ownerEmailNotifications: true,
  ownerSmsNotifications: false,
  notificationEmail: "ana@example.com",
  notificationPhone: null,
  guestEmailConfirmations: true,
  status: "draft",
  expireAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  owner: {
    id: "owner-1",
    name: "Ana",
    email: "ana@example.com",
    phone: null,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

async function withEditor(
  mode: "owner" | "founder",
  fetchImpl: typeof fetch,
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test" });
  const names = [
    "window", "document", "HTMLElement", "HTMLInputElement", "HTMLButtonElement",
    "HTMLFormElement", "Event", "FormData", "navigator", "fetch", "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    Event: dom.window.Event,
    FormData: dom.window.FormData,
    fetch: fetchImpl,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  let root: Root | null = null;
  try {
    const container = dom.window.document.querySelector<HTMLElement>("#root")!;
    const { createRoot } = await import("react-dom/client");
    const { EventEditor } = await import("./EventEditor");
    root = createRoot(container) as Root;
    await act(async () => root!.render(
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
        <EventEditor event={baseEvent} mode={mode} />
      </NextIntlClientProvider>,
    ));
    await run(container, dom);
    await act(async () => root!.unmount());
    root = null;
  } finally {
    if (root) await act(async () => root!.unmount());
    originals.forEach((descriptor, name) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

function setInput(dom: JSDOM, input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function submit(dom: JSDOM, form: HTMLFormElement) {
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

test("editing is disabled while a save request is pending", async () => {
  let finish: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  await withEditor("owner", async () => pending, async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const form = title.form!;
    await act(async () => setInput(dom, title, "Submitted title"));
    await act(async () => submit(dom, form));
    assert.equal(title.matches(":disabled"), true);
    await act(async () => {
      finish?.(response({ event: { ...baseEvent, title: "Submitted title", updatedAt: "2026-09-02T00:00:00.000Z" } }));
      await pending;
      await Promise.resolve();
    });
    assert.match(container.textContent ?? "", /Changes saved/);
  });
});

test("dirty editor blocks lifecycle actions until Save completes", async () => {
  let calls = 0;
  await withEditor("owner", async () => { calls += 1; return response({}); }, async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => setInput(dom, title, "Unsaved title"));
    const publish = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Publish invitation")!;
    assert.equal(publish.disabled, true);
    assert.match(container.textContent ?? "", /Save your changes before changing the invitation status/);
    await act(async () => publish.click());
    assert.equal(calls, 0);
  });
});

test("successful save reconciles normalized event details into inputs and preview", async () => {
  const normalized = {
    ...baseEvent,
    eventType: "anniversary",
    title: "Ten years together",
    timezone: "America/Chicago",
    startsAt: "2026-10-21T00:00:00.000Z",
    venueName: "New Hall",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
  await withEditor("owner", async () => response({ event: normalized }), async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => setInput(dom, title, "Ten years together"));
    await act(async () => {
      submit(dom, title.form!);
      await Promise.resolve();
      await Promise.resolve();
    });
    const preview = container.querySelector<HTMLElement>('[data-mobile-preview="true"]')!;
    assert.match(preview.textContent ?? "", /anniversary/);
    assert.match(preview.textContent ?? "", /New Hall/);
    assert.match(preview.textContent ?? "", /7:00 PM/);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="timezone"]')?.value, "America/Chicago");
    assert.equal(container.querySelector<HTMLInputElement>('input[name="venueName"]')?.value, "New Hall");
  });
});

test("duplicate owner email fails only the separate credential action", async () => {
  await withEditor("founder", async (input) => {
    assert.match(String(input), /\/credentials$/);
    return response({ errors: { ownerEmailTaken: "duplicate" } }, false);
  }, async (container, dom) => {
    const eventForm = container.querySelector<HTMLFormElement>('form[data-event-form="true"]')!;
    const credentialsForm = container.querySelector<HTMLFormElement>('form[data-credentials-form="true"]')!;
    assert.ok(eventForm);
    assert.ok(credentialsForm);
    assert.equal(eventForm.querySelector('input[name="ownerEmail"]'), null);
    const ownerEmail = credentialsForm.querySelector<HTMLInputElement>('input[name="ownerEmail"]')!;
    await act(async () => setInput(dom, ownerEmail, "duplicate@example.com"));
    await act(async () => {
      submit(dom, credentialsForm);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(credentialsForm.textContent ?? "", /already in use/);
    assert.match(container.textContent ?? "", /No unsaved changes/);
  });
});
