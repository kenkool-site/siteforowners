import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";

Object.assign(globalThis, { React });

function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMountedFindMeFlow(
  fetchImpl: (url: string) => Promise<Response>,
  callback: (ctx: { dom: JSDOM }) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test", virtualConsole: quietVirtualConsole() });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const trackingFetch = async (input: RequestInfo | URL) => fetchImpl(String(input));

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { FindMeFlow } = await import("./FindMeFlow");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <FindMeFlow eventId="event-1" accent="#6D456F" surface="#ffffff" onClose={() => {}} />
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

test("shows consent copy and a file input before anything is submitted", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Take or upload a selfie/);
      assert.ok(dom.window.document.querySelector('input[type="file"]'), "expected a file input for the selfie");
    },
  );
});

test("submitting a selfie posts to the find-me endpoint and shows results", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [{ id: "m1", mediaKind: "photo", uploaderDisplayName: null, objectKeyDisplay: "d", objectKeyThumbnail: "t", capturedAt: null, uploadedAt: "2026-09-24T20:00:00Z" }] }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.ok(dom.window.document.querySelector('img[src="/api/memories/media/m1/thumbnail"]'), "expected a result thumbnail for the matched photo");
    },
  );
});

test("shows the empty state when no matches are found", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /No matches found/);
    },
  );
});

test("shows the rate-limit message on a 429", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ error: "too many searches" }, 429),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /reached the search limit/);
    },
  );
});

test("the outer dialog has an accessible name pointing at the consent heading", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const dialog = dom.window.document.querySelector('[role="dialog"]');
      assert.ok(dialog, "expected a role=dialog element");
      const labelledBy = dialog!.getAttribute("aria-labelledby");
      assert.ok(labelledBy, "expected the dialog to declare aria-labelledby");
      const heading = dom.window.document.getElementById(labelledBy!);
      assert.ok(heading, `expected an element with id="${labelledBy}"`);
      assert.match(heading!.textContent ?? "", /Find your photos/);
    },
  );
});

test("rejects a non-JPEG/PNG selfie without calling the find-me endpoint, landing in the error state", async () => {
  let fetchCalled = false;
  await withMountedFindMeFlow(
    async () => {
      fetchCalled = true;
      return jsonResponse({ media: [] });
    },
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.heic", { type: "image/heic" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(20);
      });
      assert.equal(fetchCalled, false, "expected the unsupported-format selfie to never reach fetch");
      assert.match(dom.window.document.body.textContent ?? "", /Something went wrong/);
    },
  );
});

test("rejects an oversized selfie without calling the find-me endpoint, landing in the error state", async () => {
  let fetchCalled = false;
  await withMountedFindMeFlow(
    async () => {
      fetchCalled = true;
      return jsonResponse({ media: [] });
    },
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(20);
      });
      assert.equal(fetchCalled, false, "expected the oversized selfie to never reach fetch");
      assert.match(dom.window.document.body.textContent ?? "", /Something went wrong/);
    },
  );
});

test("offers a Try another selfie button after an empty result, returning to the consent/file-input screen", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /No matches found/);

      const tryAgain = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent === "Try another selfie");
      assert.ok(tryAgain, "expected a Try another selfie button in the empty state");
      await act(async () => {
        tryAgain!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        await flush(20);
      });

      assert.ok(dom.window.document.querySelector('input[type="file"]'), "expected to return to the file-input screen");
      assert.match(dom.window.document.body.textContent ?? "", /Take or upload a selfie/);
    },
  );
});

test("offers a Try another selfie button after an error, returning to the consent/file-input screen", async () => {
  await withMountedFindMeFlow(
    async () => new Response(null, { status: 500 }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /Something went wrong/);

      const tryAgain = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent === "Try another selfie");
      assert.ok(tryAgain, "expected a Try another selfie button in the error state");
      await act(async () => {
        tryAgain!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        await flush(20);
      });

      assert.ok(dom.window.document.querySelector('input[type="file"]'), "expected to return to the file-input screen");
      assert.match(dom.window.document.body.textContent ?? "", /Take or upload a selfie/);
    },
  );
});

test("does not offer a Try another selfie button in the rate-limited state", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ error: "too many searches" }, 429),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /reached the search limit/);

      const tryAgain = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent === "Try another selfie");
      assert.equal(tryAgain, undefined, "expected no Try another selfie button after a rate-limit denial");
    },
  );
});
