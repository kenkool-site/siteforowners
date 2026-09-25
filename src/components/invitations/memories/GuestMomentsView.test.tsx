import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";

Object.assign(globalThis, { React });

// Matches GuestGalleryView.test.tsx's own convention: omitJSDOMErrors keeps
// unrelated jsdom "not implemented" noise out of this file's output.
function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

function mediaItem(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: "Jamie",
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: "2026-09-22T20:00:00Z",
    uploadedAt: "2026-09-22T20:01:00Z",
    ...overrides,
  };
}

function moment(overrides: Partial<MemoryMoment> & { id: string }): MemoryMoment {
  return {
    name: "Ceremony",
    startsAt: "2026-09-22T19:00:00Z",
    endsAt: "2026-09-22T21:00:00Z",
    sortOrder: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMountedMoments(media: PublicMemoryMedia[], moments: MemoryMoment[], callback: (ctx: { dom: JSDOM }) => Promise<void>) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://invite.example.test",
    virtualConsole: quietVirtualConsole(),
  });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    fetch: async () => jsonResponse({ media, moments }),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { GuestMomentsView } = await import("./GuestMomentsView");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestMomentsView eventId="event-1" accent="#6D456F" surface="#ffffff" />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await callback({ dom });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

function click(dom: JSDOM, element: Element | null) {
  assert.ok(element, "expected element to exist before clicking");
  (element as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

test("module loads under tsx --test", async () => {
  const mod = await import("./GuestMomentsView");
  assert.equal(typeof mod.GuestMomentsView, "function");
});

test("a video item's thumbnail shows a play-badge overlay; a photo item's does not, inside a moment's detail view", async () => {
  const m = moment({ id: "moment-1" });
  await withMountedMoments(
    [mediaItem("m1", { mediaKind: "photo" }), mediaItem("m2", { mediaKind: "video" })],
    [m],
    async ({ dom }) => {
      const card = dom.window.document.querySelector('img[src="/api/memories/media/m1/thumbnail"]')?.closest("button") ?? null;
      await act(async () => {
        click(dom, card);
        await flush();
      });

      const photoImg = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]');
      // A video's own file lives at /display (it's the raw clip, not
      // decodable as an image) — the moment's detail grid must point a
      // video's <img> at /thumbnail instead, matching the cover tile's own
      // already-correct kind-aware selection below.
      const videoImg = dom.window.document.querySelector('img[src="/api/memories/media/m2/thumbnail"]');
      assert.ok(photoImg, "expected the photo to render in the moment's detail view");
      assert.ok(videoImg, "expected the video to render in the moment's detail view");

      const photoWrapper = photoImg!.parentElement;
      const videoWrapper = videoImg!.parentElement;
      assert.ok(!photoWrapper?.querySelector('[data-play-badge="true"]'), "photo tile must not show a play badge");
      assert.ok(videoWrapper?.querySelector('[data-play-badge="true"]'), "video tile must show a play badge");
    },
  );
});

test("a moment's cover tile shows a play-badge overlay when its first photo is a video", async () => {
  const momentA = moment({ id: "moment-a", name: "First Dance" });
  const momentB = moment({ id: "moment-b", name: "Cake Cutting", startsAt: "2026-09-22T21:00:00Z", endsAt: "2026-09-22T22:00:00Z", sortOrder: 1 });
  await withMountedMoments(
    [
      mediaItem("m1", { mediaKind: "video", capturedAt: "2026-09-22T20:00:00Z" }),
      mediaItem("m2", { mediaKind: "photo", capturedAt: "2026-09-22T21:30:00Z" }),
    ],
    [momentA, momentB],
    async ({ dom }) => {
      const videoCoverImg = dom.window.document.querySelector('img[src="/api/memories/media/m1/thumbnail"]');
      const photoCoverImg = dom.window.document.querySelector('img[src="/api/memories/media/m2/thumbnail"]');
      assert.ok(videoCoverImg, "expected the video moment's cover thumbnail to render");
      assert.ok(photoCoverImg, "expected the photo moment's cover thumbnail to render");

      const videoCoverWrapper = videoCoverImg!.parentElement;
      const photoCoverWrapper = photoCoverImg!.parentElement;
      assert.ok(videoCoverWrapper?.querySelector('[data-play-badge="true"]'), "video moment cover must show a play badge");
      assert.ok(!photoCoverWrapper?.querySelector('[data-play-badge="true"]'), "photo moment cover must not show a play badge");
    },
  );
});
