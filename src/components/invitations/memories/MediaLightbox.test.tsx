import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

Object.assign(globalThis, { React });

// omitJSDOMErrors keeps unrelated jsdom "not implemented" noise out of this
// file's output, matching GuestGalleryView.test.tsx / GuestAiHighlightView.test.tsx's
// own convention.
function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

// jsdom implements neither requestAnimationFrame nor cancelAnimationFrame at
// all (not even as a stub) — MediaLightbox's slide sequencing (navigateWithSlide)
// uses both, so without this polyfill any navigation (button, keyboard, or
// swipe-driven) would throw. A plain setTimeout shim is standard practice for
// this exact gap, copied verbatim from GuestGalleryView.test.tsx.
function polyfillAnimationFrame(dom: JSDOM): void {
  dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(Date.now()), 16)) as typeof dom.window.requestAnimationFrame;
  dom.window.cancelAnimationFrame = ((id: number) => dom.window.clearTimeout(id)) as typeof dom.window.cancelAnimationFrame;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLImageElement", "HTMLVideoElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

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

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchCall = { url: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// jsdom has no real PointerEvent constructor with usable coordinate data (see
// MediaLightbox.tsx's own comment on resolveSwipeNavigation), so a swipe is
// simulated by dispatching a plain Event and attaching the handful of
// properties (clientX, pointerId) that MediaLightbox's handlers actually
// read — React's synthetic event system pulls these off the native event by
// plain property access, not by checking `instanceof PointerEvent`.
function pointerEvent(dom: JSDOM, type: string, clientX: number): Event {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { value: clientX, configurable: true });
  Object.defineProperty(event, "pointerId", { value: 1, configurable: true });
  return event;
}

// MediaLightbox is controlled: it takes `index` as a prop and calls
// `onNavigate` to request a change, exactly like its real callers
// (GuestGalleryView, GuestAiHighlightView). This harness owns that bit of
// state itself so a simulated swipe can be observed end-to-end, the same way
// a real caller would re-render MediaLightbox at the new index.
async function withMountedLightbox(
  media: PublicMemoryMedia[],
  initialIndex: number,
  callback: (ctx: { dom: JSDOM; calls: FetchCall[] }) => Promise<void>,
  fetchImpl: (url: string) => Promise<Response> = async () => jsonResponse({ media: [] }),
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://invite.example.test",
    virtualConsole: quietVirtualConsole(),
  });
  polyfillAnimationFrame(dom);
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
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLVideoElement: dom.window.HTMLVideoElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { MediaLightbox } = await import("./MediaLightbox");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  function Harness() {
    const [index, setIndex] = React.useState(initialIndex);
    return <MediaLightbox media={media} index={index} onClose={() => {}} onNavigate={setIndex} />;
  }

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <Harness />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await callback({ dom, calls });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

test("locks background scroll while open and restores it once closed", async () => {
  let capturedDom: JSDOM | null = null;
  await withMountedLightbox([mediaItem("m1")], 0, async ({ dom }) => {
    capturedDom = dom;
    const body = dom.window.document.body;
    assert.equal(body.style.overflow, "hidden");
    assert.equal(body.style.position, "fixed");
  });
  assert.ok(capturedDom, "expected dom to have been captured during mount");
  const body = capturedDom!.window.document.body;
  assert.equal(body.style.overflow, "", "expected overflow restored after the lightbox unmounts");
  assert.equal(body.style.position, "", "expected position restored after the lightbox unmounts");
});

test("a video item renders a <video controls> element with the display URL, not an <img>", async () => {
  await withMountedLightbox([mediaItem("m1", { mediaKind: "video" })], 0, async ({ dom }) => {
    const videoEl = dom.window.document.querySelector("video");
    assert.ok(videoEl, "expected a <video> element for a video item");
    assert.equal(videoEl!.getAttribute("src"), "/api/memories/media/m1/display");
    // A real poster image is guaranteed to exist by the time a video is
    // guest-visible (upload/complete/route.ts won't mark a video ready
    // without one) — without this attribute the guest sees a blank/black
    // frame before tapping play.
    assert.equal(videoEl!.getAttribute("poster"), "/api/memories/media/m1/thumbnail");
    assert.ok(videoEl!.hasAttribute("controls"));
    // The feature's global constraint: video must never autoplay — the guest
    // taps the native controls to start playback. Asserted here so a future
    // edit (e.g. copy-pasting from a different video component) that adds
    // `autoPlay` gets caught instead of silently regressing.
    assert.equal(videoEl!.hasAttribute("autoplay"), false, "expected no autoplay attribute on the video element");
    assert.ok(!dom.window.document.querySelector("img"), "expected no <img> for a video item");
  });
});

test("a photo item still renders an <img>, unchanged", async () => {
  await withMountedLightbox([mediaItem("m1", { mediaKind: "photo" })], 0, async ({ dom }) => {
    const imgEl = dom.window.document.querySelector("img");
    assert.ok(imgEl, "expected an <img> element for a photo item");
    assert.equal(imgEl!.getAttribute("src"), "/api/memories/media/m1/display");
    assert.ok(!dom.window.document.querySelector("video"), "expected no <video> for a photo item");
  });
});

test("swipe navigation still advances the index when moving from a photo to a video item in the same list", async () => {
  await withMountedLightbox(
    [mediaItem("m1", { mediaKind: "photo" }), mediaItem("m2", { mediaKind: "video" })],
    0,
    async ({ dom }) => {
      const photoEl = dom.window.document.querySelector('img[src="/api/memories/media/m1/display"]');
      assert.ok(photoEl, "expected the first (photo) item to render initially");

      // A leftward drag past SWIPE_THRESHOLD_PX (50px): down at 300, move to
      // 200 (delta -100), release — same pointer sequence the pure-logic
      // tests in MediaLightbox.test.ts exercise via resolveSwipeNavigation.
      //
      // Each dispatch gets its own act() rather than one shared act() around
      // all three: "pointermove" is a React continuous-priority event, so its
      // setDragX update is not guaranteed to commit before the very next
      // synchronous dispatchEvent call — only act() resolving forces that
      // flush. Sharing one act() left handlePointerUp reading a stale dragX
      // (still 0) via its closure, so the swipe was never recognized.
      await act(async () => {
        photoEl!.dispatchEvent(pointerEvent(dom, "pointerdown", 300));
      });
      await act(async () => {
        photoEl!.dispatchEvent(pointerEvent(dom, "pointermove", 200));
      });
      await act(async () => {
        photoEl!.dispatchEvent(pointerEvent(dom, "pointerup", 200));
        // navigateWithSlide defers the actual index swap until the exit
        // animation's SETTLE_DURATION_MS (260ms) plus two polyfilled
        // requestAnimationFrame hops — 320ms comfortably covers that, matching
        // GuestGalleryView.test.tsx's own proven flush window for this exact
        // deferred-navigation shape.
        await flush(320);
      });

      const videoEl = dom.window.document.querySelector("video");
      assert.ok(videoEl, "expected the video element to be showing at index 1 after the swipe");
      assert.equal(videoEl!.getAttribute("src"), "/api/memories/media/m2/display");
      assert.ok(!dom.window.document.querySelector("img"), "expected no <img> once swiped onto the video item");
    },
  );
});

test("swipe navigation advances when the gesture starts on the <video> element itself", async () => {
  await withMountedLightbox(
    [mediaItem("m1", { mediaKind: "video" }), mediaItem("m2", { mediaKind: "photo" })],
    0,
    async ({ dom }) => {
      const videoEl = dom.window.document.querySelector('video[src="/api/memories/media/m1/display"]');
      assert.ok(videoEl, "expected the first (video) item to render initially");

      // Same leftward drag past SWIPE_THRESHOLD_PX as the photo->video swipe
      // test above, but this time the pointer sequence targets the <video>
      // element itself, since it's the currently displayed item — the same
      // onPointerDown/Move/Up handlers are wired to both <img> and <video>,
      // but until now no test dispatched pointer events at a real <video>
      // DOM node. Each dispatch keeps its own act() call for the same reason
      // as above: "pointermove" is a React continuous-priority event, so
      // batching all three into one act() leaves handlePointerUp reading a
      // stale dragX.
      await act(async () => {
        videoEl!.dispatchEvent(pointerEvent(dom, "pointerdown", 300));
      });
      await act(async () => {
        videoEl!.dispatchEvent(pointerEvent(dom, "pointermove", 200));
      });
      await act(async () => {
        videoEl!.dispatchEvent(pointerEvent(dom, "pointerup", 200));
        await flush(320);
      });

      const imgEl = dom.window.document.querySelector("img");
      assert.ok(imgEl, "expected the photo element to be showing at index 1 after swiping away from the video");
      assert.equal(imgEl!.getAttribute("src"), "/api/memories/media/m2/display");
      assert.ok(!dom.window.document.querySelector("video"), "expected no <video> once swiped off the video item");
    },
  );
});

test("shows the nearby strip with a count label when matches exist", async () => {
  const matches = [mediaItem("m2", { uploaderDisplayName: null })];
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom, calls }) => {
      assert.ok(calls.some((c) => c.url.endsWith("/api/memories/media/m1/nearby")), "expected a fetch to the nearby endpoint for the displayed item");
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /1 other captured this moment/);
    },
    async () => jsonResponse({ media: matches }),
  );
});

test("shows no strip when there are no nearby matches", async () => {
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.doesNotMatch(text, /captured this moment/);
    },
    async () => jsonResponse({ media: [] }),
  );
});

test("shows an uploader caption under a nearby thumbnail only when the uploader gave a name", async () => {
  const matches = [mediaItem("named", { uploaderDisplayName: "Priya" }), mediaItem("anon", { uploaderDisplayName: null })];
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Priya/);
      const thumbnails = dom.window.document.querySelectorAll('img[src^="/api/memories/media/"][src$="/thumbnail"]');
      assert.equal(thumbnails.length, 2);
    },
    async () => jsonResponse({ media: matches }),
  );
});

// Every dispatch below gets its own act() call rather than one shared act()
// around the sequence — matching this file's established reasoning (see the
// swipe tests above): "pointermove" is a React continuous-priority event, so
// its state update is not guaranteed to commit before the next synchronous
// dispatchEvent call unless act() resolving forces that flush first. This
// file has already hit the bug that comes from skipping this once.
test("hides the nearby strip while a drag is in progress", async () => {
  await withMountedLightbox(
    [mediaItem("m1"), mediaItem("m2")],
    0,
    async ({ dom }) => {
      await flush();
      assert.match(dom.window.document.body.textContent ?? "", /1 other captured this moment/);

      const img = dom.window.document.querySelector(`img[src="/api/memories/media/m1/display"]`)!;
      await act(async () => {
        img.dispatchEvent(pointerEvent(dom, "pointerdown", 200));
      });
      await act(async () => {
        img.dispatchEvent(pointerEvent(dom, "pointermove", 100));
      });

      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /captured this moment/, "expected the strip to hide mid-drag");

      await act(async () => {
        img.dispatchEvent(pointerEvent(dom, "pointerup", 100));
        await flush(320);
      });
    },
    async () => jsonResponse({ media: [mediaItem("m2")] }),
  );
});

test("tapping a nearby thumbnail already in the current list navigates via onNavigate, without a detour", async () => {
  await withMountedLightbox(
    [mediaItem("m1"), mediaItem("m2")],
    0,
    async ({ dom }) => {
      await flush();
      const thumbnailButton = dom.window.document.querySelector(`img[src="/api/memories/media/m2/thumbnail"]`)?.closest("button");
      assert.ok(thumbnailButton, "expected a tappable nearby thumbnail for m2");
      await act(async () => {
        thumbnailButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        await flush(320);
      });
      assert.match(dom.window.document.body.textContent ?? "", /Photo 2 of 2/);
    },
    async (url) => (url.endsWith("/m1/nearby") ? jsonResponse({ media: [mediaItem("m2")] }) : jsonResponse({ media: [] })),
  );
});

test("suppresses the nearby strip entirely when the displayed item is a video, even with nonempty nearby matches", async () => {
  const matches = [mediaItem("m2", { uploaderDisplayName: null })];
  await withMountedLightbox(
    [mediaItem("m1", { mediaKind: "video" })],
    0,
    async ({ dom, calls }) => {
      await flush();
      // The nearby fetch still happens (it's keyed off the displayed item's
      // id regardless of kind) — it's only the strip's render that's
      // suppressed for a video, so a future pass can turn it on once the
      // control-bar overlap is designed for.
      assert.ok(calls.some((c) => c.url.endsWith("/api/memories/media/m1/nearby")));
      const text = dom.window.document.body.textContent ?? "";
      assert.doesNotMatch(text, /captured this moment/, "expected no nearby strip while a video is the displayed item");
    },
    async () => jsonResponse({ media: matches }),
  );
});

// jsdom cannot simulate real hit-testing (a tap "landing on" the covered
// native video control bar vs. bubbling to the dialog's onClick), so this is
// a structural check on the footer wrapper's own className instead of an
// attempt to fake click-through behavior — proving the fix (pointer-events-none
// on the wrapper, pointer-events-auto on the inner strip container) is
// actually in place rather than asserting on behavior this environment can't
// observe.
test("the footer overlay wrapper is click-through (pointer-events-none) so it never swallows taps meant for the video controls beneath it", async () => {
  await withMountedLightbox([mediaItem("m1", { mediaKind: "video" })], 0, async ({ dom }) => {
    const videoEl = dom.window.document.querySelector("video");
    assert.ok(videoEl, "expected a <video> element for a video item");
    const footer = videoEl!.parentElement?.querySelector(".pointer-events-none.absolute.inset-x-0.bottom-0");
    assert.ok(footer, "expected the footer overlay wrapper to carry pointer-events-none");
  });
});

test("tapping a nearby thumbnail outside the current list starts a detour, with a distinct footer label", async () => {
  const outsideMatch = mediaItem("outside", { uploaderDisplayName: null });
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      await flush();
      const thumbnailButton = dom.window.document.querySelector(`img[src="/api/memories/media/outside/thumbnail"]`)?.closest("button");
      assert.ok(thumbnailButton, "expected a tappable nearby thumbnail for the outside match");
      await act(async () => {
        thumbnailButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        await flush(320);
      });
      assert.match(dom.window.document.body.textContent ?? "", /Browsing nearby moment · 2 of 2/);
      assert.ok(
        dom.window.document.querySelector(`img[src="/api/memories/media/outside/display"]`),
        "expected the lightbox to now display the detoured item",
      );
    },
    async (url) => {
      if (url.endsWith("/m1/nearby")) return jsonResponse({ media: [outsideMatch] });
      return jsonResponse({ media: [] });
    },
  );
});

test("shows who shared the photo and when, for a named uploader", async () => {
  const capturedAt = "2026-09-24T22:08:00.000Z";
  await withMountedLightbox([mediaItem("m1", { uploaderDisplayName: "Priya", capturedAt })], 0, async ({ dom }) => {
    await flush();
    const date = new Date(capturedAt);
    const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, new RegExp(`Photo shared by Priya · ${day}, ${time}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("shows just the date, with no uploader phrasing, when the upload is anonymous", async () => {
  const capturedAt = "2026-09-24T22:08:00.000Z";
  await withMountedLightbox([mediaItem("m1", { uploaderDisplayName: null, capturedAt })], 0, async ({ dom }) => {
    await flush();
    const date = new Date(capturedAt);
    const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const text = dom.window.document.body.textContent ?? "";
    assert.doesNotMatch(text, /Photo shared by/);
    assert.match(text, new RegExp(`${day}, ${time}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("shows no metadata line at all when capturedAt is null", async () => {
  await withMountedLightbox([mediaItem("m1", { capturedAt: null })], 0, async ({ dom }) => {
    await flush();
    const text = dom.window.document.body.textContent ?? "";
    assert.doesNotMatch(text, /Photo shared by/);
  });
});

test("sharing copies a link to the exact item and shows a confirmation, when the native share sheet isn't available", async () => {
  await withMountedLightbox([mediaItem("m1"), mediaItem("m2")], 1, async ({ dom }) => {
    let copied: string | null = null;
    // jsdom implements neither navigator.share nor navigator.clipboard —
    // stubbed here rather than in the shared harness since only this test
    // needs them.
    Object.defineProperty(dom.window.navigator, "clipboard", {
      value: { writeText: async (text: string) => { copied = text; } },
      configurable: true,
    });

    const shareButton = dom.window.document.querySelector('button[aria-label="Share"]');
    assert.ok(shareButton, "expected a share button");
    await act(async () => {
      shareButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      await flush();
    });

    assert.ok(copied, "expected the link to be copied to the clipboard");
    const url = new URL(copied!);
    assert.equal(url.searchParams.get("photo"), "m2");
    assert.match(dom.window.document.body.textContent ?? "", /Link copied!/);
  });
});
