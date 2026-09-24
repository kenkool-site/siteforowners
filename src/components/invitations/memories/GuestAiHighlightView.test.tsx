import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { GuestAiHighlightViewProps, GuestHighlightGroup } from "./GuestAiHighlightView";

Object.assign(globalThis, { React });

// The component now calls window.scrollTo for scroll-position restoration
// (see GuestAiHighlightView.tsx). jsdom has no real layout engine, so it
// stubs scrollTo as "not implemented" and reports it as a jsdomError purely
// for feature-detection purposes — omitJSDOMErrors is jsdom's own documented
// way to silence exactly this class of expected noise without swallowing
// real console output.
function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

function highlightGroup(overrides: Partial<GuestHighlightGroup> & { id: string }): GuestHighlightGroup {
  return {
    eventId: "event-1",
    name: "Cake Cutting",
    description: null,
    semanticKey: overrides.id,
    source: "fallback",
    sortOrder: 0,
    isVisible: true,
    media: [],
    ...overrides,
  };
}

function mediaItem(id: string): GuestHighlightGroup["media"][number] {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: "Jamie",
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: "2026-09-22T20:00:00Z",
    uploadedAt: "2026-09-22T20:01:00Z",
  };
}

function baseProps(overrides: Partial<GuestAiHighlightViewProps> = {}): GuestAiHighlightViewProps {
  return { eventId: "event-1", accent: "#6D456F", surface: "#ffffff", ...overrides };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// A real timer wait, not a fixed microtask-tick count — matching
// OwnerHighlightsManager.test.tsx's own proven, zero-act()-warning flush
// pattern for a multi-hop async chain (fetch -> .json() -> setState x2).
function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchCall = { url: string };

async function withMountedComponent(
  props: GuestAiHighlightViewProps,
  fetchImpl: (url: string) => Promise<Response>,
  callback: (ctx: { dom: JSDOM; calls: FetchCall[] }) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test", virtualConsole: quietVirtualConsole() });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: FetchCall[] = [];
  const trackingFetch = async (input: RequestInfo | URL) => {
    calls.push({ url: String(input) });
    return fetchImpl(String(input));
  };

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { GuestAiHighlightView } = await import("./GuestAiHighlightView");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestAiHighlightView {...props} />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await callback({ dom, calls });
    await act(async () => {
      await flush();
    });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

function click(dom: JSDOM, element: Element | null) {
  assert.ok(element, "expected element to exist before clicking");
  (element as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

function byText(dom: JSDOM, selector: string, text: string): HTMLElement | null {
  const candidates = Array.from(dom.window.document.querySelectorAll(selector));
  return (candidates.find((el) => el.textContent?.trim() === text) as HTMLElement | undefined) ?? null;
}

test("module loads under tsx --test", async () => {
  const mod = await import("./GuestAiHighlightView");
  assert.equal(typeof mod.GuestAiHighlightView, "function");
});

test("fetches the new highlights endpoint, not the old gallery endpoint", async () => {
  await withMountedComponent(
    baseProps(),
    async () => jsonResponse({ groups: [] }),
    async ({ calls }) => {
      assert.ok(calls.some((c) => c.url.endsWith("/api/memories/events/event-1/highlights")), "expected a fetch to the highlights endpoint");
      assert.ok(!calls.some((c) => c.url.includes("/gallery")), "must not fetch the old gallery endpoint");
    },
  );
});

test("renders a group card per published group, with its photo count", async () => {
  await withMountedComponent(
    baseProps(),
    async () =>
      jsonResponse({
        groups: [
          highlightGroup({ id: "g1", name: "Cake Cutting", media: [mediaItem("m1"), mediaItem("m2")] }),
          highlightGroup({ id: "g2", name: "First Dance", media: [mediaItem("m3")] }),
        ],
      }),
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Cake Cutting/);
      assert.match(text, /First Dance/);
      assert.match(text, /2 photos/);
      assert.match(text, /1 photo\b/);
    },
  );
});

test("a photo belonging to multiple groups is rendered inside every one of those groups' detail views", async () => {
  await withMountedComponent(
    baseProps(),
    async () =>
      jsonResponse({
        groups: [
          highlightGroup({ id: "g1", name: "Cake Cutting", media: [mediaItem("shared")] }),
          highlightGroup({ id: "g2", name: "Reception", media: [mediaItem("shared")] }),
        ],
      }),
    async ({ dom }) => {
      // Open the first group and confirm the shared photo renders.
      await act(async () => {
        click(dom, byText(dom, "button", "Cake Cutting")?.closest("button") ?? byText(dom, "p", "Cake Cutting")?.closest("button") ?? null);
        await flush();
      });
      let images = Array.from(dom.window.document.querySelectorAll("img"));
      assert.ok(images.some((img) => img.getAttribute("src") === "/api/memories/media/shared/display"), "expected the shared photo in group 1's detail view");

      // Go back and open the second group — the same photo must appear there too.
      await act(async () => {
        click(dom, byText(dom, "button", "Back"));
        await flush();
      });
      await act(async () => {
        click(dom, byText(dom, "p", "Reception")?.closest("button") ?? null);
        await flush();
      });
      images = Array.from(dom.window.document.querySelectorAll("img"));
      assert.ok(images.some((img) => img.getAttribute("src") === "/api/memories/media/shared/display"), "expected the same shared photo in group 2's detail view");
    },
  );
});

test("clicking a group card selects it, shows its name/description and photos, and Back returns to the grid", async () => {
  await withMountedComponent(
    baseProps(),
    async () =>
      jsonResponse({
        groups: [highlightGroup({ id: "g1", name: "Cake Cutting", description: "The big moment", media: [mediaItem("m1")] })],
      }),
    async ({ dom }) => {
      const card = byText(dom, "p", "Cake Cutting")?.closest("button") ?? null;
      await act(async () => {
        click(dom, card);
        await flush();
      });
      let text = dom.window.document.body.textContent ?? "";
      assert.match(text, /The big moment/);
      assert.ok(dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]'), "expected the group's photo in detail view");

      const backButton = byText(dom, "button", "Back");
      assert.ok(backButton, "expected a back control");
      await act(async () => {
        click(dom, backButton);
        await flush();
      });
      text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Cake Cutting/); // back on the grid, card still listed
      assert.doesNotMatch(text, /The big moment/); // detail-only description no longer shown
    },
  );
});

test("remembers the grid's scroll position and restores it on Back, instead of landing at the top", async () => {
  await withMountedComponent(
    baseProps(),
    async () => jsonResponse({ groups: [highlightGroup({ id: "g1", name: "Cake Cutting", media: [mediaItem("m1")] })] }),
    async ({ dom }) => {
      const scrollCalls: Array<[number, number]> = [];
      dom.window.scrollTo = ((x: number, y: number) => {
        scrollCalls.push([x, y]);
      }) as typeof dom.window.scrollTo;
      // scrollY is typed read-only in lib.dom.d.ts, but jsdom itself defines
      // it as a plain writable property (there is no real layout engine
      // backing it) — Object.defineProperty sidesteps the type-level
      // restriction without an `any` cast.
      Object.defineProperty(dom.window, "scrollY", { value: 400, configurable: true });

      const card = byText(dom, "p", "Cake Cutting")?.closest("button") ?? null;
      await act(async () => {
        click(dom, card);
        await flush();
      });
      assert.deepEqual(scrollCalls.at(-1), [0, 0], "expected the detail view to open scrolled to its own top");

      const backButton = byText(dom, "button", "Back");
      await act(async () => {
        click(dom, backButton);
        await flush();
      });
      assert.deepEqual(scrollCalls.at(-1), [0, 400], "expected Back to restore the grid's prior scroll position, not reset to 0");
    },
  );
});

test("tapping a photo in a category opens it fullscreen, supports next/previous, and closes", async () => {
  await withMountedComponent(
    baseProps(),
    async () =>
      jsonResponse({
        groups: [highlightGroup({ id: "g1", name: "Cake Cutting", media: [mediaItem("m1"), mediaItem("m2")] })],
      }),
    async ({ dom }) => {
      const card = byText(dom, "p", "Cake Cutting")?.closest("button") ?? null;
      await act(async () => {
        click(dom, card);
        await flush();
      });

      const firstPhotoButton = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]')?.closest("button") ?? null;
      await act(async () => {
        click(dom, firstPhotoButton);
        await flush();
      });

      assert.ok(dom.window.document.querySelector('[role="dialog"]'), "expected the lightbox to open");
      assert.match(dom.window.document.body.textContent ?? "", /Photo 1 of 2/);

      const nextButton = dom.window.document.querySelector('button[aria-label="Next photo"]');
      assert.ok(nextButton, "expected a next-photo control since there is a second photo");
      await act(async () => {
        click(dom, nextButton);
        await flush();
      });
      assert.match(dom.window.document.body.textContent ?? "", /Photo 2 of 2/);
      assert.ok(!dom.window.document.querySelector('button[aria-label="Next photo"]'), "no next control on the last photo");

      const closeButton = dom.window.document.querySelector('button[aria-label="Close"]');
      await act(async () => {
        click(dom, closeButton);
        await flush();
      });
      assert.ok(!dom.window.document.querySelector('[role="dialog"]'), "expected the lightbox to close");
    },
  );
});

test("shows the empty state when there are no published groups", async () => {
  await withMountedComponent(baseProps(), async () => jsonResponse({ groups: [] }), async ({ dom }) => {
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /No AI highlights yet/);
  });
});

test("shows a loading state before the fetch resolves", async () => {
  let resolveFetch: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test", virtualConsole: quietVirtualConsole() });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    fetch: async () => pending,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { GuestAiHighlightView } = await import("./GuestAiHighlightView");
  const root = createRoot(dom.window.document.querySelector("#root")!);
  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestAiHighlightView {...baseProps()} />
        </NextIntlClientProvider>,
      );
    });
    assert.match(dom.window.document.body.textContent ?? "", /Finding highlights/);
    resolveFetch?.(jsonResponse({ groups: [] }));
    await act(async () => {
      await flush();
    });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
});

test("a fetch failure resolves to the empty state instead of crashing or hanging on loading", async () => {
  await withMountedComponent(
    baseProps(),
    async () => jsonResponse({ error: "boom" }, 500),
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.doesNotMatch(text, /Finding highlights/);
      assert.match(text, /No AI highlights yet/);
    },
  );
});

test("never references Moments in its request, props, or rendered output", async () => {
  // Targeted symbol checks, not a blanket /moment/i sweep — this file's own
  // header comment legitimately explains its relationship to the old
  // Moments-based system it replaces. What must never appear is a live
  // reference: the MemoryMoment type/import, momentId, the old aiHighlightGroups
  // helper, or a fetch against the old gallery endpoint (which returned
  // moments alongside media).
  const source = (await import("node:fs")).readFileSync(new URL("./GuestAiHighlightView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /MemoryMoment/);
  assert.doesNotMatch(source, /momentId/);
  assert.doesNotMatch(source, /aiHighlightGroups/);
  // The gallery *module* (@/lib/invitations/memories/gallery) is a legitimate
  // import (PublicMemoryMedia lives there) — what must be gone is a fetch
  // against the old gallery *endpoint*, which returned moments alongside media.
  assert.doesNotMatch(source, /events\/\$\{eventId\}\/gallery/);

  await withMountedComponent(
    baseProps(),
    async () => jsonResponse({ groups: [highlightGroup({ id: "g1", name: "Cake Cutting", media: [mediaItem("m1")] })] }),
    async ({ calls }) => {
      for (const call of calls) {
        assert.doesNotMatch(call.url, /moment/i);
      }
    },
  );
});
