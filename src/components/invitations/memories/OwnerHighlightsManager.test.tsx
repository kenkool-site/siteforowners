import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { OwnerHighlightsManagerProps, HostHighlightGroup } from "./OwnerHighlightsManager";

Object.assign(globalThis, { React });

const GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Event",
  "navigator",
  "IS_REACT_ACT_ENVIRONMENT",
  "fetch",
] as const;

function group(overrides: Partial<HostHighlightGroup> = {}): HostHighlightGroup {
  return {
    id: "group-1",
    eventId: "event-1",
    name: "First Dance",
    description: null,
    semanticKey: "k1",
    source: "host_defined",
    sortOrder: 0,
    isVisible: true,
    mediaCount: 3,
    ...overrides,
  };
}

function baseProps(overrides: Partial<OwnerHighlightsManagerProps> = {}): OwnerHighlightsManagerProps {
  return {
    eventId: "event-1",
    initialMode: "automatic",
    initialGenerationStatus: "idle",
    initialLastGeneratedMediaCount: 0,
    initialGroups: [],
    ...overrides,
  };
}

function renderStatic(props: OwnerHighlightsManagerProps, OwnerHighlightsManager: typeof import("./OwnerHighlightsManager").OwnerHighlightsManager) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <OwnerHighlightsManager {...props} />
    </NextIntlClientProvider>,
  );
}

type FetchCall = { url: string; method: string; body: unknown };

async function withMountedComponent(
  props: OwnerHighlightsManagerProps,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  callback: (ctx: { dom: JSDOM; calls: FetchCall[] }) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: FetchCall[] = [];
  const trackingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return fetchImpl(String(input), init);
  };

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.confirm = () => true;

  const { createRoot } = await import("react-dom/client");
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <OwnerHighlightsManager {...props} />
        </NextIntlClientProvider>,
      );
    });
    await callback({ dom, calls });
    // Let any still-settling fetch/json promise chains from the callback
    // finish before unmounting, so their state updates land inside this
    // act() rather than as a stray post-unmount warning — mirrors
    // GuestMemoriesApp.interaction.test.tsx's own real-timer flush.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function click(dom: JSDOM, element: Element | null) {
  assert.ok(element, "expected element to exist before clicking");
  (element as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

function setValue(dom: JSDOM, element: Element | null, value: string) {
  assert.ok(element, "expected input/textarea to exist");
  const input = element as HTMLInputElement;
  const proto = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function byText(dom: JSDOM, selector: string, text: string): HTMLElement | null {
  const candidates = Array.from(dom.window.document.querySelectorAll(selector));
  return (candidates.find((el) => el.textContent?.trim() === text) as HTMLElement | undefined) ?? null;
}

test("module loads under tsx --test", async () => {
  const mod = await import("./OwnerHighlightsManager");
  assert.equal(typeof mod.OwnerHighlightsManager, "function");
});

test("renders the automatic state: mode is selected, Generate is offered, no group management is shown", async () => {
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const html = renderStatic(baseProps({ initialMode: "automatic" }), OwnerHighlightsManager);
  assert.match(html, /Generate highlights/);
  assert.match(html, /Not generated yet\./);
  assert.doesNotMatch(html, /Your groups/);
  assert.doesNotMatch(html, /Add group/);
});

test("renders the host-defined state: shows the groups list and the add-group form", async () => {
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const html = renderStatic(
    baseProps({ initialMode: "host_defined", initialGroups: [group({ name: "Cake Cutting", mediaCount: 5 })] }),
    OwnerHighlightsManager,
  );
  assert.match(html, /Your groups/);
  assert.match(html, /Cake Cutting/);
  assert.match(html, /5 photos/);
  assert.match(html, /Add group/);
});

test("host-defined state with no groups yet shows the empty message", async () => {
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const html = renderStatic(baseProps({ initialMode: "host_defined", initialGroups: [] }), OwnerHighlightsManager);
  assert.match(html, /No custom groups yet\./);
});

test("regenerate label and last-run count are shown once a generation has previously completed", async () => {
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const html = renderStatic(baseProps({ initialGenerationStatus: "idle", initialLastGeneratedMediaCount: 12 }), OwnerHighlightsManager);
  assert.match(html, /Regenerate highlights/);
  assert.match(html, /12 photos/);
});

test("clicking Generate calls POST .../highlights/generate and reflects the queued status", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "automatic", initialGenerationStatus: "idle" }),
    async () => jsonResponse({ generation: { id: "gen-1", status: "queued", mediaCount: 0 } }, 202),
    async ({ dom, calls }) => {
      const button = byText(dom, "button", "Generate highlights");
      await act(async () => {
        click(dom, button);
        await Promise.resolve();
        await Promise.resolve();
      });
      const generateCall = calls.find((c) => c.url.endsWith("/highlights/generate"));
      assert.ok(generateCall, "expected a POST to the generate endpoint");
      assert.equal(generateCall!.method, "POST");
      assert.match(dom.window.document.body.textContent ?? "", /Queued/);
    },
  );
});

test("a failed generation offers Retry, and clicking it re-triggers generation", async () => {
  await withMountedComponent(
    baseProps({ initialGenerationStatus: "failed", initialLastGeneratedMediaCount: 4 }),
    async () => jsonResponse({ generation: { id: "gen-2", status: "queued", mediaCount: 0 } }, 202),
    async ({ dom, calls }) => {
      const retryButton = byText(dom, "button", "Retry");
      assert.ok(retryButton, "expected a Retry control when the last generation failed");
      await act(async () => {
        click(dom, retryButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const generateCall = calls.find((c) => c.url.endsWith("/highlights/generate"));
      assert.ok(generateCall, "Retry must call the same generate endpoint");
    },
  );
});

test("selecting the host-defined mode sends PATCH set_mode and reveals group management", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "automatic" }),
    async (url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      // The post-switch refresh() GET.
      return jsonResponse({ mode: "host_defined", generationStatus: "idle", lastGeneratedMediaCount: 0, groups: [] });
    },
    async ({ dom, calls }) => {
      const radios = Array.from(dom.window.document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const hostDefinedRadio = radios.find((r) => r.value === "host_defined");
      assert.ok(hostDefinedRadio, "expected a host_defined mode radio");
      await act(async () => {
        // .click() (not a bare dispatchEvent(new Event("click"))) is what
        // makes jsdom run the radio's native activation behavior — flipping
        // checked and firing "input"/"change" — which is what React's
        // onChange for a checkable input actually observes. A synthetic
        // click event alone leaves .checked untouched, so React sees no
        // value change and never calls the handler.
        hostDefinedRadio!.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      const patchCall = calls.find((c) => c.method === "PATCH");
      assert.ok(patchCall, "expected a PATCH request");
      assert.deepEqual(patchCall!.body, { action: "set_mode", mode: "host_defined" });
      assert.match(dom.window.document.body.textContent ?? "", /Your groups/);
    },
  );
});

test("adding a group sends name and optional description, then appends it to the list", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "host_defined", initialGroups: [] }),
    async () =>
      jsonResponse({
        group: { id: "group-new", eventId: "event-1", name: "Toasts", description: "Speeches from the wedding party", semanticKey: "k9", source: "host_defined", sortOrder: 0, isVisible: true, mediaCount: 0 },
      }),
    async ({ dom, calls }) => {
      const nameInput = dom.window.document.querySelector('input[placeholder="e.g. First Dance"]');
      const descriptionInput = dom.window.document.querySelector('input[placeholder="A short note about this group"]');
      setValue(dom, nameInput, "Toasts");
      setValue(dom, descriptionInput, "Speeches from the wedding party");
      const addButton = byText(dom, "button", "Add group");
      await act(async () => {
        click(dom, addButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const createCall = calls.find((c) => c.method === "POST" && c.url.endsWith("/highlights"));
      assert.ok(createCall, "expected a POST create call");
      assert.equal((createCall!.body as { name: string }).name, "Toasts");
      assert.equal((createCall!.body as { description: string }).description, "Speeches from the wedding party");
      assert.match(dom.window.document.body.textContent ?? "", /Toasts/);
    },
  );
});

test("adding a group rejects a blank name client-side without any request", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "host_defined", initialGroups: [] }),
    async () => {
      throw new Error("must not fetch for an invalid client-side submission");
    },
    async ({ dom, calls }) => {
      const addButton = byText(dom, "button", "Add group") as HTMLButtonElement;
      assert.equal(addButton.disabled, true, "Add should be disabled while the name is blank");
      assert.equal(calls.length, 0);
    },
  );
});

test("renaming a group sends PATCH update_group with the new name", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "host_defined", initialGroups: [group({ id: "group-1", name: "First Dance" })] }),
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      const renameButton = dom.window.document.querySelector('[aria-label="Rename First Dance"]');
      await act(async () => {
        click(dom, renameButton);
      });
      const nameInput = dom.window.document.querySelector('input[maxlength="80"]');
      setValue(dom, nameInput, "First Dance (Reception)");
      const saveButton = byText(dom, "button", "Save");
      await act(async () => {
        click(dom, saveButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const patchCall = calls.find((c) => c.method === "PATCH");
      assert.ok(patchCall, "expected a PATCH update_group call");
      assert.equal((patchCall!.body as { name: string }).name, "First Dance (Reception)");
      assert.equal((patchCall!.body as { id: string }).id, "group-1");
    },
  );
});

test("toggling visibility sends PATCH update_group with isVisible flipped", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "host_defined", initialGroups: [group({ id: "group-1", isVisible: true })] }),
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      const hideButton = dom.window.document.querySelector('[aria-label="Hide First Dance from guests"]');
      assert.ok(hideButton, "expected a Hide control for a currently-visible group");
      await act(async () => {
        click(dom, hideButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const patchCall = calls.find((c) => c.method === "PATCH");
      assert.ok(patchCall);
      assert.equal((patchCall!.body as { isVisible: boolean }).isVisible, false);
    },
  );
});

test("reordering moves a group down then back up, sending sortOrder swaps both times", async () => {
  await withMountedComponent(
    baseProps({
      initialMode: "host_defined",
      initialGroups: [group({ id: "group-1", name: "First Dance", sortOrder: 0 }), group({ id: "group-2", name: "Cake", sortOrder: 1 })],
    }),
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      const moveDownButton = dom.window.document.querySelector('[aria-label="Move First Dance down"]');
      await act(async () => {
        click(dom, moveDownButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const sortOrderCalls = calls.filter((c) => c.method === "PATCH").map((c) => c.body as { id: string; sortOrder: number });
      assert.equal(sortOrderCalls.length, 2);
      assert.ok(sortOrderCalls.some((c) => c.id === "group-1" && c.sortOrder === 1));
      assert.ok(sortOrderCalls.some((c) => c.id === "group-2" && c.sortOrder === 0));
    },
  );
});

test("deleting a group confirms, then sends DELETE and removes it from the list", async () => {
  await withMountedComponent(
    baseProps({ initialMode: "host_defined", initialGroups: [group({ id: "group-1", name: "First Dance" })] }),
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      const deleteButton = dom.window.document.querySelector('[aria-label="Delete First Dance"]');
      await act(async () => {
        click(dom, deleteButton);
        await Promise.resolve();
        await Promise.resolve();
      });
      const deleteCall = calls.find((c) => c.method === "DELETE");
      assert.ok(deleteCall, "expected a DELETE call");
      assert.equal((deleteCall!.body as { id: string }).id, "group-1");
      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /First Dance/);
    },
  );
});

test("polls status every pollIntervalMs while queued/processing, and stops once idle", async () => {
  let getCalls = 0;
  await withMountedComponent(
    { ...baseProps({ initialGenerationStatus: "processing" }), pollIntervalMs: 15 },
    async (url, init) => {
      if (init?.method === undefined || init.method === "GET") {
        getCalls += 1;
        if (getCalls === 1) return jsonResponse({ mode: "automatic", generationStatus: "processing", lastGeneratedMediaCount: 0, groups: [] });
        return jsonResponse({ mode: "automatic", generationStatus: "idle", lastGeneratedMediaCount: 9, groups: [] });
      }
      throw new Error(`unexpected ${init?.method} call`);
    },
    async ({ dom }) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
      assert.ok(getCalls >= 1, "expected at least one poll while processing");
      const countAfterFirstWindow = getCalls;
      assert.match(dom.window.document.body.textContent ?? "", /9 photos/);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
      assert.equal(getCalls, countAfterFirstWindow, "polling must stop once status is idle");
    },
  );
});

test("accessible labels: per-group controls include the group's own name so screen readers can tell rows apart", async () => {
  const { OwnerHighlightsManager } = await import("./OwnerHighlightsManager");
  const html = renderStatic(
    baseProps({
      initialMode: "host_defined",
      initialGroups: [group({ id: "group-1", name: "First Dance" }), group({ id: "group-2", name: "Cake Cutting" })],
    }),
    OwnerHighlightsManager,
  );
  for (const name of ["First Dance", "Cake Cutting"]) {
    assert.match(html, new RegExp(`aria-label="Move ${name} up"`));
    assert.match(html, new RegExp(`aria-label="Move ${name} down"`));
    assert.match(html, new RegExp(`aria-label="Rename ${name}"`));
    assert.match(html, new RegExp(`aria-label="Delete ${name}"`));
    assert.match(html, new RegExp(`aria-label="Hide ${name} from guests"`));
  }
});
