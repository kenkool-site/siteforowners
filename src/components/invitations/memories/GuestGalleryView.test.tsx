import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

Object.assign(globalThis, { React });

// MediaLightbox calls window.scrollTo-adjacent APIs are not used here, but it
// does add a keydown listener and this harness mounts/unmounts React roots
// repeatedly — omitJSDOMErrors keeps unrelated jsdom "not implemented" noise
// (e.g. window.scrollTo, used by sibling views) out of this file's output,
// matching GuestAiHighlightView.test.tsx's own convention.
function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

// jsdom implements neither requestAnimationFrame nor cancelAnimationFrame at
// all (not even as a stub) — MediaLightbox's slide sequencing uses both, so
// without this polyfill every Next/Previous click would throw. A plain
// setTimeout shim is standard practice for this exact gap.
function polyfillAnimationFrame(dom: JSDOM): void {
  dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(Date.now()), 16)) as typeof dom.window.requestAnimationFrame;
  dom.window.cancelAnimationFrame = ((id: number) => dom.window.clearTimeout(id)) as typeof dom.window.cancelAnimationFrame;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

// Far enough in the past (well past groupMediaByTime's 18-hour "earlier"
// cutoff, and gallery's own 20-minute "recent" window) that every fixture
// lands deterministically in the "Earlier Today" masonry section, regardless
// of when this test actually runs.
const OLD_TIMESTAMP = "2020-01-01T00:00:00Z";

function mediaItem(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: "Jamie",
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: OLD_TIMESTAMP,
    uploadedAt: OLD_TIMESTAMP,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMountedGallery(media: PublicMemoryMedia[], callback: (ctx: { dom: JSDOM }) => Promise<void>, findMeEnabled = false) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://invite.example.test",
    virtualConsole: quietVirtualConsole(),
  });
  polyfillAnimationFrame(dom);
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    // MediaLightbox (mounted by this file's tests once a photo is tapped)
    // fetches /api/memories/media/[id]/nearby on its own — without a
    // URL-aware stub, that fetch would resolve to this same gallery-shaped
    // `{ media }` payload (which includes the anchor item itself) and render
    // an unintended "Every Perspective" strip, the same latent-collision
    // shape GuestAiHighlightView.test.tsx hit earlier in this plan. Matches
    // the URL-aware pattern MediaLightbox.test.tsx and
    // GuestMemoriesApp.interaction.test.tsx already use.
    fetch: async (input: RequestInfo | URL) => (String(input).endsWith("/nearby") ? jsonResponse({ media: [] }) : jsonResponse({ media })),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { GuestGalleryView } = await import("./GuestGalleryView");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestGalleryView eventId="event-1" accent="#6D456F" surface="#ffffff" uploads={[]} findMeEnabled={findMeEnabled} />
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
  const mod = await import("./GuestGalleryView");
  assert.equal(typeof mod.GuestGalleryView, "function");
});

test("tapping a photo opens the shared lightbox showing its full, uncropped image", async () => {
  await withMountedGallery([mediaItem("m1"), mediaItem("m2")], async ({ dom }) => {
    assert.ok(!dom.window.document.querySelector('[role="dialog"]'), "lightbox must not be open initially");

    const photoButton = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]')?.closest("button") ?? null;
    await act(async () => {
      click(dom, photoButton);
      await flush();
    });

    const dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialog, "expected the lightbox to open");
    assert.ok(dialog!.querySelector('img[src="/api/memories/media/m1/display"]'), "expected the full-resolution image, not the thumbnail, inside the lightbox");
  });
});

test("next/previous navigate between photos and are bounded at the ends", async () => {
  await withMountedGallery([mediaItem("m1"), mediaItem("m2"), mediaItem("m3")], async ({ dom }) => {
    const firstPhotoButton = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]')?.closest("button") ?? null;
    await act(async () => {
      click(dom, firstPhotoButton);
      await flush();
    });

    assert.match(dom.window.document.body.textContent ?? "", /Photo 1 of 3/);
    assert.ok(!dom.window.document.querySelector('button[aria-label="Previous photo"]'), "no previous control on the first photo");

    // Next/Previous now defer the actual index change until the exit
    // animation finishes (see MediaLightbox.tsx's navigateWithSlide) — the
    // photo lets its exit motion play out rather than popping instantly.
    // Verify that deferral is real, not just tolerated by a generous flush.
    const nextButton = dom.window.document.querySelector('button[aria-label="Next photo"]');
    await act(async () => {
      click(dom, nextButton);
      await flush(20);
    });
    assert.match(dom.window.document.body.textContent ?? "", /Photo 1 of 3/, "expected the index change to still be deferred right after the click");

    await act(async () => {
      await flush(320);
    });
    assert.match(dom.window.document.body.textContent ?? "", /Photo 2 of 3/);

    await act(async () => {
      click(dom, dom.window.document.querySelector('button[aria-label="Next photo"]'));
      await flush(320);
    });
    assert.match(dom.window.document.body.textContent ?? "", /Photo 3 of 3/);
    assert.ok(!dom.window.document.querySelector('button[aria-label="Next photo"]'), "no next control on the last photo");
  });
});

test("clicking Next twice in quick succession settles cleanly on the second photo", async () => {
  await withMountedGallery([mediaItem("m1"), mediaItem("m2"), mediaItem("m3")], async ({ dom }) => {
    const firstPhotoButton = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]')?.closest("button") ?? null;
    await act(async () => {
      click(dom, firstPhotoButton);
      await flush();
    });

    // Both clicks land before the first one's deferred navigation commits, so
    // both resolve to the same target (index hasn't advanced yet in either
    // click's closure) — this exercises navigateWithSlide's own cancellation
    // of a still-pending previous transition, guarding against two
    // overlapping exit/re-enter animation chains corrupting each other's
    // dragX/transition state and leaving the lightbox stuck or visibly wrong.
    await act(async () => {
      click(dom, dom.window.document.querySelector('button[aria-label="Next photo"]'));
      await flush(20);
      click(dom, dom.window.document.querySelector('button[aria-label="Next photo"]'));
      await flush(320);
    });
    assert.match(dom.window.document.body.textContent ?? "", /Photo 2 of 3/);
  });
});

test("a video item's thumbnail shows a play-badge overlay; a photo item's does not", async () => {
  await withMountedGallery([mediaItem("m1", { mediaKind: "photo" }), mediaItem("m2", { mediaKind: "video" })], async ({ dom }) => {
    const photoImg = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]');
    // A video's own file lives at /display (it's the raw clip, not decodable
    // as an image) — the "Earlier Today" grid must point a video's <img> at
    // /thumbnail instead, matching the story-strip's own already-correct
    // kind-aware selection just above.
    const videoImg = dom.window.document.querySelector('img[src="/api/memories/media/m2/thumbnail"]');
    assert.ok(photoImg, "expected the photo thumbnail to render");
    assert.ok(videoImg, "expected the video thumbnail to render");

    const photoFigure = photoImg!.closest("figure");
    const videoFigure = videoImg!.closest("figure");
    assert.ok(!photoFigure?.querySelector('[data-play-badge="true"]'), "photo thumbnail must not show a play badge");
    assert.ok(videoFigure?.querySelector('[data-play-badge="true"]'), "video thumbnail must show a play badge");
  });
});

test("closing the lightbox returns to the gallery grid", async () => {
  await withMountedGallery([mediaItem("m1")], async ({ dom }) => {
    const photoButton = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]')?.closest("button") ?? null;
    await act(async () => {
      click(dom, photoButton);
      await flush();
    });
    assert.ok(dom.window.document.querySelector('[role="dialog"]'));

    await act(async () => {
      click(dom, dom.window.document.querySelector('button[aria-label="Close"]'));
      await flush();
    });
    assert.ok(!dom.window.document.querySelector('[role="dialog"]'), "expected the lightbox to close");
    assert.ok(dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]'), "expected the gallery grid to still show the photo");
  });
});

test("shows the Find Me banner when findMeEnabled is true, and nothing when it's false", async () => {
  await withMountedGallery([mediaItem("m1")], async ({ dom }) => {
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Find yourself in these photos/);
  }, false);

  await withMountedGallery([mediaItem("m1")], async ({ dom }) => {
    assert.match(dom.window.document.body.textContent ?? "", /Find yourself in these photos/);
  }, true);
});
