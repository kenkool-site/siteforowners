import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { MemoryMedia } from "@/lib/invitations/memories/types";
import { OwnerMemoriesReviewQueue } from "./OwnerMemoriesReviewQueue";

Object.assign(globalThis, { React });

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

function removedMedia(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: "session-1",
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: `originals/${overrides.id}.jpg`,
    objectKeyDisplay: `display/${overrides.id}.webp`,
    objectKeyThumbnail: `thumb/${overrides.id}.webp`,
    capturedAt: null,
    uploadedAt: "2026-09-26T12:00:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "rejected",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  };
}

type FetchCall = { url: string; method: string; body: unknown };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function byText(dom: JSDOM, selector: string, text: string): HTMLElement | null {
  const candidates = Array.from(dom.window.document.querySelectorAll(selector));
  return (candidates.find((el) => el.textContent?.trim() === text) as HTMLElement | undefined) ?? null;
}

function click(dom: JSDOM, element: Element | null) {
  assert.ok(element, "expected element to exist before clicking");
  (element as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

async function withMountedQueue(
  removed: MemoryMedia[],
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  confirmResult: boolean,
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
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.confirm = () => confirmResult;

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <OwnerMemoriesReviewQueue eventId="event-1" mode="auto_publish" initialLive={[]} initialFlagged={[]} initialRemoved={removed} initialPending={[]} initialPublished={[]} initialRejected={[]} mediaBasePath="/api/invitations/events/event-1/memories/media" />
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

test("the Removed tab shows a Delete all permanently button when it has items", async () => {
  await withMountedQueue([removedMedia({ id: "media-1" })], async () => jsonResponse({}), true, async ({ dom }) => {
    await act(async () => {
      click(dom, byText(dom, "button", "Removed"));
      await flush();
    });
    assert.ok(byText(dom, "button", "Delete all permanently"), "expected the permanent-delete button on the Removed tab");
  });
});

test("the Live tab never shows the Delete all permanently button", async () => {
  await withMountedQueue([removedMedia({ id: "media-1" })], async () => jsonResponse({}), true, async ({ dom }) => {
    assert.ok(!byText(dom, "button", "Delete all permanently"), "expected no permanent-delete button outside the Removed/Rejected tabs");
  });
});

test("clicking Delete all permanently asks for confirmation, then DELETEs every item in the tab and removes them from the list", async () => {
  const removed = [removedMedia({ id: "media-1" }), removedMedia({ id: "media-2" })];
  await withMountedQueue(removed, async () => jsonResponse({ ok: true, deletedIds: ["media-1", "media-2"] }), true, async ({ dom, calls }) => {
    await act(async () => {
      click(dom, byText(dom, "button", "Removed"));
      await flush();
    });

    await act(async () => {
      click(dom, byText(dom, "button", "Delete all permanently"));
      await flush();
    });

    const deleteCall = calls.find((c) => c.method === "DELETE");
    assert.ok(deleteCall, "expected a DELETE request");
    assert.equal(deleteCall!.url, "/api/invitations/events/event-1/memories/moderation");
    assert.deepEqual(new Set((deleteCall!.body as { mediaIds: string[] }).mediaIds), new Set(["media-1", "media-2"]));

    assert.ok(!byText(dom, "button", "Delete all permanently"), "expected the button to disappear once the tab is empty");
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /Nothing here right now\./);
  });
});

test("cancelling the confirmation dialog sends no request and keeps the items", async () => {
  const removed = [removedMedia({ id: "media-1" })];
  await withMountedQueue(removed, async () => jsonResponse({ ok: true }), false, async ({ dom, calls }) => {
    await act(async () => {
      click(dom, byText(dom, "button", "Removed"));
      await flush();
    });

    await act(async () => {
      click(dom, byText(dom, "button", "Delete all permanently"));
      await flush();
    });

    assert.ok(!calls.some((c) => c.method === "DELETE"), "a cancelled confirmation must not send a request");
    assert.ok(byText(dom, "button", "Delete all permanently"), "expected the item and button to remain after cancelling");
  });
});
