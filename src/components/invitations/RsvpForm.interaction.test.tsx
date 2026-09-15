import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { editUrl } from "../../lib/invitations/rsvp";

(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

async function withRsvpForm(
  options: {
    url: string;
    slug: string;
    allowCreate: boolean;
    preview?: boolean;
    storage?: Record<string, string>;
    fetchImpl?: typeof fetch;
  },
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: options.url });
  for (const [key, value] of Object.entries(options.storage ?? {})) {
    dom.window.localStorage.setItem(key, value);
  }

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
    fetch: options.fetchImpl ?? (async () => { throw new Error("fetch should not be called in this test"); }),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  let root: Root | null = null;
  try {
    const container = dom.window.document.querySelector<HTMLElement>("#root")!;
    const { createRoot } = await import("react-dom/client");
    const { RsvpForm } = await import("./RsvpForm");
    root = createRoot(container) as Root;
    await act(async () => root!.render(
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <RsvpForm slug={options.slug} allowCreate={options.allowCreate} showPublicRsvpCount={false} preview={options.preview} />
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

function storageKey(slug: string): string {
  return `invitation-rsvp-edit:${slug}`;
}

const ORIGIN = "https://app.example.test";
const SLUG = "ana-and-luis";

test("preview ignores stored edit capabilities and blocks even programmatic submission", async () => {
  let calls = 0;
  await withRsvpForm({ url: ORIGIN, slug: SLUG, allowCreate: true, preview: true,
    storage: { [storageKey(SLUG)]: editUrl(ORIGIN, SLUG, "11111111-1111-4111-8111-111111111111", "secret") },
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ ok: true })); },
  }, async (container, dom) => {
    assert.doesNotMatch(container.textContent ?? "", /securely updating/);
    await act(async () => submit(dom, container.querySelector("form")!));
    assert.equal(calls, 0);
  });
});

test("a guest who opens a legacy edit link resumes the edit session without persisting it", async () => {
  const rsvpId = "11111111-1111-4111-8111-111111111111";
  const generated = editUrl(ORIGIN, SLUG, rsvpId, "secret-edit-token");

  await withRsvpForm(
    { url: generated, slug: SLUG, allowCreate: false },
    async (container, dom) => {
      assert.match(container.textContent ?? "", /securely updating an existing response/i);
      assert.equal(dom.window.localStorage.getItem(storageKey(SLUG)), null);
    },
  );
});

test("a saved edit link in browser storage is no longer used", async () => {
  const rsvpId = "22222222-2222-4222-8222-222222222222";
  const generated = editUrl(ORIGIN, SLUG, rsvpId, "another-secret-token");

  await withRsvpForm(
    {
      url: `${ORIGIN}/invite/${SLUG}`,
      slug: SLUG,
      allowCreate: false,
      storage: { [storageKey(SLUG)]: generated },
    },
    async (container) => {
      assert.match(container.textContent ?? "", /no longer accepting new responses/i);
      assert.doesNotMatch(container.textContent ?? "", /securely updating an existing response/i);
    },
  );
});

test("a closed invitation with no saved credential stays on the closed message, not the form", async () => {
  await withRsvpForm(
    { url: `${ORIGIN}/invite/${SLUG}`, slug: SLUG, allowCreate: false },
    async (container) => {
      assert.match(container.textContent ?? "", /no longer accepting new responses/i);
      assert.doesNotMatch(container.textContent ?? "", /securely updating an existing response/i);
    },
  );
});

test("a successful submission shows its outcome without exposing or persisting an edit link", async () => {
  await withRsvpForm(
    {
      url: `${ORIGIN}/invite/${SLUG}`,
      slug: SLUG,
      allowCreate: true,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ ok: true, outcome: "created" }),
      })) as unknown as typeof fetch,
    },
    async (container, dom) => {
      const name = container.querySelector<HTMLInputElement>('input[name="primaryName"]')!;
      const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
      await act(async () => {
        setInput(dom, name, "Ana Guest");
        setInput(dom, email, "ana@example.com");
      });
      const form = name.form!;
      await act(async () => {
        submit(dom, form);
        await Promise.resolve();
        await Promise.resolve();
      });

      assert.equal(dom.window.localStorage.getItem(storageKey(SLUG)), null);
      assert.match(container.textContent ?? "", /your response has been saved/i);
      assert.doesNotMatch(container.textContent ?? "", /securely updating an existing response/i);
      assert.doesNotMatch(container.textContent ?? "", /copy edit link/i);
      assert.match(container.textContent ?? "", /update response/i);
    },
  );
});

for (const [outcome, message] of [
  ["updated", /your response has been updated/i],
  ["unchanged", /you already submitted this response/i],
] as const) {
  test(`a contact-matched ${outcome} response explains the outcome`, async () => {
    await withRsvpForm({
      url: `${ORIGIN}/invite/${SLUG}`,
      slug: SLUG,
      allowCreate: true,
      fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, outcome }) })) as unknown as typeof fetch,
    }, async (container, dom) => {
      const name = container.querySelector<HTMLInputElement>('input[name="primaryName"]')!;
      const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
      await act(async () => {
        setInput(dom, name, "Ana Guest");
        setInput(dom, email, "ana@example.com");
        submit(dom, name.form!);
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.match(container.textContent ?? "", message);
      assert.doesNotMatch(container.textContent ?? "", /copy edit link/i);
    });
  });
}
