import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";

Object.assign(globalThis, { React });

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "File", "URL", "XMLHttpRequest", "navigator", "fetch", "IS_REACT_ACT_ENVIRONMENT"] as const;

function flush(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all (see
// GuestAiHighlightView.test.tsx's polyfillAnimationFrame for the same class
// of gap with requestAnimationFrame). handleFiles calls this directly for
// every picked file (photo or video), not just inside the video-only
// functions below, so this must always be installed.
function polyfillObjectUrl(dom: JSDOM): void {
  let counter = 0;
  dom.window.URL.createObjectURL = (() => `blob:mock-${counter++}`) as typeof URL.createObjectURL;
  dom.window.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
}

// jsdom has no canvas/video-decoding support at all (getContext("2d") returns
// null). GuestUploadView's own readVideoDurationSeconds/capturePosterFrame
// are real <video>/canvas code, verified manually per the design spec's
// Testing section — here we stand in for the browser by intercepting
// document.createElement("video"/"canvas") so those two (unexported, real)
// functions run their real logic against a fake element instead of a real
// one, "mocking" them at the DOM boundary.
function installVideoCanvasStubs(dom: JSDOM, durationSeconds: number, options: { failPosterCapture?: boolean } = {}): void {
  const doc = dom.window.document;
  const originalCreateElement = doc.createElement.bind(doc);
  doc.createElement = ((tagName: string, createOptions?: ElementCreationOptions) => {
    if (tagName === "video") {
      let onloadedmetadata: (() => void) | null = null;
      let onloadeddata: (() => void) | null = null;
      const fakeVideo = {
        preload: "",
        muted: false,
        videoWidth: 640,
        videoHeight: 360,
        duration: durationSeconds,
        onerror: null,
        get onloadedmetadata() { return onloadedmetadata; },
        set onloadedmetadata(fn: (() => void) | null) { onloadedmetadata = fn; },
        get onloadeddata() { return onloadeddata; },
        set onloadeddata(fn: (() => void) | null) { onloadeddata = fn; },
        set src(_value: string) {
          queueMicrotask(() => {
            onloadedmetadata?.();
            onloadeddata?.();
          });
        },
      };
      return fakeVideo as unknown as HTMLVideoElement;
    }
    if (tagName === "canvas") {
      // options.failPosterCapture reproduces a real browser condition
      // capturePosterFrame's own code already checks for and rejects on
      // (getContext("2d") returning null) — used to test the poster-capture
      // failure path without inventing a new kind of fake.
      const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => (options.failPosterCapture ? null : { drawImage: () => undefined }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          callback(new dom.window.Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) as unknown as Blob);
        },
      };
      return fakeCanvas as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tagName, createOptions);
  }) as typeof doc.createElement;
}

type FetchCall = { url: string; body: Record<string, unknown> | undefined };

function trackingFetch(calls: FetchCall[], impl: (url: string, body: Record<string, unknown> | undefined) => Promise<Response>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, body });
    return impl(url, body);
  };
}

// Records every XHR PUT this test's uploadOne makes (main file and, for
// video, the poster) — mirrors EventEditor.interaction.test.tsx's
// SuccessfulUploadRequest convention, generalized to record multiple PUTs
// from one upload since a video item PUTs both its file and its poster.
function createRecordingXHRClass() {
  const calls: Array<{ method: string; url: string }> = [];
  class RecordingXHR {
    status = 200;
    withCredentials = false;
    private listeners = new Map<string, EventListener>();
    upload = { addEventListener: () => undefined };
    open(method: string, url: string) {
      calls.push({ method, url });
    }
    setRequestHeader() {}
    addEventListener(type: string, listener: EventListener) {
      this.listeners.set(type, listener);
    }
    send() {
      queueMicrotask(() => this.listeners.get("load")?.(new Event("load")));
    }
  }
  return { XHRClass: RecordingXHR as unknown as typeof XMLHttpRequest, calls };
}

async function withMountedUploadView(
  opts: {
    eventId: string;
    fetchImpl: (url: string, body: Record<string, unknown> | undefined) => Promise<Response>;
    XHRClass: typeof XMLHttpRequest;
    durationSeconds?: number;
    failPosterCapture?: boolean;
  },
  run: (ctx: { dom: JSDOM; fetchCalls: FetchCall[]; xhrCalls: Array<{ method: string; url: string }>; getLatestItems: () => GuestUploadPreview[] }) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  polyfillObjectUrl(dom);
  if (opts.durationSeconds !== undefined) installVideoCanvasStubs(dom, opts.durationSeconds, { failPosterCapture: opts.failPosterCapture });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const fetchCalls: FetchCall[] = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    File: dom.window.File,
    URL: dom.window.URL,
    XMLHttpRequest: opts.XHRClass,
    fetch: trackingFetch(fetchCalls, opts.fetchImpl),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { GuestUploadView } = await import("./GuestUploadView");
  const root = createRoot(dom.window.document.querySelector("#root")!);
  let latestItems: GuestUploadPreview[] = [];

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <GuestUploadView eventId={opts.eventId} accent="#6D456F" onItemsChange={(items) => { latestItems = items; }} />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await run({
      dom,
      fetchCalls,
      xhrCalls: (opts.XHRClass as unknown as { calls?: Array<{ method: string; url: string }> }).calls ?? [],
      getLatestItems: () => latestItems,
    });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

function pickFiles(dom: JSDOM, files: File[]): void {
  const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: files });
}

test("module loads under tsx --test", async () => {
  const mod = await import("./GuestUploadView");
  assert.equal(typeof mod.GuestUploadView, "function");
});

test("a picked video file is enqueued with mediaKind video and its captured poster, not treated as a photo", async () => {
  const { XHRClass, calls: xhrCalls } = createRecordingXHRClass();
  await withMountedUploadView(
    {
      eventId: "event-video-ok",
      durationSeconds: 10,
      XHRClass,
      fetchImpl: async (url) => {
        if (url.endsWith("/upload/init")) {
          return jsonResponse({ mediaId: "media-v1", ticket: "ticket-v1", uploadUrl: "https://storage.test/video-put", posterUploadUrl: "https://storage.test/poster-put" });
        }
        if (url.endsWith("/upload/complete")) return jsonResponse({ ok: true });
        throw new Error(`unexpected fetch ${url}`);
      },
    },
    async ({ dom, fetchCalls }) => {
      const video = new dom.window.File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
      await act(async () => {
        pickFiles(dom, [video]);
        dom.window.document.querySelector('input[type="file"]')!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush();
      });

      const initCall = fetchCalls.find((c) => c.url.endsWith("/upload/init"));
      assert.ok(initCall, "expected a fetch to upload/init");
      assert.equal(initCall!.body?.mediaKind, "video");

      assert.equal(xhrCalls.length, 2, "expected two PUTs: the video file and its poster");
      assert.equal(xhrCalls[0].url, "https://storage.test/video-put");
      assert.equal(xhrCalls[1].url, "https://storage.test/poster-put");

      assert.ok(fetchCalls.some((c) => c.url.endsWith("/upload/complete") && c.body?.mediaId === "media-v1"));
    },
  );
});

test("a video longer than 60 seconds is rejected before any network call", async () => {
  const { XHRClass } = createRecordingXHRClass();
  await withMountedUploadView(
    {
      eventId: "event-video-toolong",
      durationSeconds: 61,
      XHRClass,
      fetchImpl: async (url) => {
        throw new Error(`unexpected fetch ${url}`);
      },
    },
    async ({ dom, fetchCalls, getLatestItems }) => {
      const video = new dom.window.File([new Uint8Array([1, 2, 3])], "toolong.mp4", { type: "video/mp4" });
      await act(async () => {
        pickFiles(dom, [video]);
        dom.window.document.querySelector('input[type="file"]')!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush();
      });

      assert.equal(fetchCalls.length, 0, "expected no network call for a rejected video");
      assert.deepEqual(getLatestItems(), [], "expected the video to never be enqueued");

      const alertText = dom.window.document.querySelector('[role="alert"]')?.textContent ?? "";
      assert.match(alertText, /Videos can be up to 60 seconds/);
    },
  );
});

test("a picked photo file is still enqueued with mediaKind photo and no poster, unchanged", async () => {
  const { XHRClass, calls: xhrCalls } = createRecordingXHRClass();
  await withMountedUploadView(
    {
      eventId: "event-photo-ok",
      XHRClass,
      fetchImpl: async (url) => {
        if (url.endsWith("/upload/init")) {
          return jsonResponse({ mediaId: "media-p1", ticket: "ticket-p1", uploadUrl: "https://storage.test/photo-put" });
        }
        if (url.endsWith("/upload/complete")) return jsonResponse({ ok: true });
        throw new Error(`unexpected fetch ${url}`);
      },
    },
    async ({ dom, fetchCalls, getLatestItems }) => {
      const heic = new dom.window.File([new Uint8Array([1])], "photo.heic", { type: "image/heic" });
      const jpeg = new dom.window.File([new Uint8Array([1, 2])], "photo.jpg", { type: "image/jpeg" });
      await act(async () => {
        pickFiles(dom, [heic, jpeg]);
        dom.window.document.querySelector('input[type="file"]')!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush();
      });

      // HEIC is still rejected, unchanged.
      const alertText = dom.window.document.querySelector('[role="alert"]')?.textContent ?? "";
      assert.match(alertText, /iPhone's default photo format isn't supported yet/);

      // The jpeg is still enqueued as mediaKind photo, with a single PUT (no poster).
      const initCall = fetchCalls.find((c) => c.url.endsWith("/upload/init"));
      assert.ok(initCall, "expected a fetch to upload/init for the jpeg");
      assert.equal(initCall!.body?.mediaKind, "photo");
      assert.equal(xhrCalls.length, 1, "expected exactly one PUT — no poster for a photo");
      assert.equal(xhrCalls[0].url, "https://storage.test/photo-put");

      const items = getLatestItems();
      assert.equal(items.length, 1);
      assert.equal(items[0].status, "done");
      assert.equal(items[0].mediaId, "media-p1");
    },
  );
});

test("a video whose poster frame capture fails is never enqueued and shows the generic error", async () => {
  const { XHRClass } = createRecordingXHRClass();
  await withMountedUploadView(
    {
      eventId: "event-video-poster-fail",
      durationSeconds: 10,
      failPosterCapture: true,
      XHRClass,
      fetchImpl: async (url) => {
        throw new Error(`unexpected fetch ${url}`);
      },
    },
    async ({ dom, fetchCalls, getLatestItems }) => {
      const video = new dom.window.File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
      await act(async () => {
        pickFiles(dom, [video]);
        dom.window.document.querySelector('input[type="file"]')!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush();
      });

      // capturePosterFrame rejects (no canvas context) inside handleFiles's
      // try block, before queueRef.current.enqueue is ever reached — so no
      // upload/init call and no queued item, same as the other pre-queue
      // rejections (HEIC, duration) above.
      assert.equal(fetchCalls.length, 0, "expected no network call when poster capture fails");
      assert.deepEqual(getLatestItems(), [], "expected the video to never be enqueued");

      const alertText = dom.window.document.querySelector('[role="alert"]')?.textContent ?? "";
      assert.match(alertText, /Something went wrong — please try again/);
    },
  );
});
