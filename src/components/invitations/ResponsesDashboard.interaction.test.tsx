import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { ResponsesDashboard, type InvitationResponsesDashboard } from "./ResponsesDashboard";

Object.assign(globalThis, { React });

const dashboard: InvitationResponsesDashboard = {
  responses: [{
    id: "00000000-0000-4000-8000-000000000001",
    eventId: "event-1",
    primaryName: "Ana Rivera",
    email: "ana@example.test",
    phone: null,
    attending: true,
    partySize: 1,
    additionalGuestNames: [],
    dietaryOrAccessibilityNotes: null,
    message: null,
    createdAt: "2026-09-13T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
  }],
  filteredTotal: 1,
  page: 1,
  perPage: 25,
  summary: {
    attendingPeople: 1,
    attendingParties: 1,
    declinedParties: 0,
    remainingCapacity: null,
    totalSubmissions: 1,
  },
  notificationWarningCount: 0,
  warnings: [],
  failedNotifications: [],
};

async function withDashboard(
  initialData: InvitationResponsesDashboard,
  fetchImpl: typeof fetch,
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test" });
  const names = ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLFormElement", "Event", "DOMException", "AbortController", "fetch", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    Event: dom.window.Event,
    DOMException: dom.window.DOMException,
    AbortController: dom.window.AbortController,
    fetch: fetchImpl,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.querySelector<HTMLElement>("#root")!;
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
          <ResponsesDashboard eventId="event-1" mode="owner" initialData={initialData} />
        </NextIntlClientProvider>,
      );
      await Promise.resolve();
    });
    await run(container, dom);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, name) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

test("opening the response editor focuses its heading and submits through its own form", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  await withDashboard(dashboard, async (input, init) => {
    const method = init?.method ?? "GET";
    requests.push({ url: String(input), method });
    return {
      ok: true,
      json: async () => method === "PATCH" ? { ok: true } : dashboard,
    } as Response;
  }, async (container, dom) => {
    const edit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Edit response");
    assert.ok(edit);
    await act(async () => edit.click());

    const heading = container.querySelector<HTMLElement>("#response-edit-heading");
    assert.ok(heading);
    assert.equal(dom.window.document.activeElement, heading);
    const form = heading.closest<HTMLFormElement>('form[data-response-edit-form="true"]');
    assert.ok(form);
    assert.equal(form.querySelector('button[type="submit"]')?.textContent, "Save response");
    await act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(requests.filter((request) => request.method === "PATCH").length, 1);
  });
});

test("a clamped response reload synchronizes the next request to the last valid page", async () => {
  const requestedUrls: string[] = [];
  const initialData = { ...dashboard, page: 2, perPage: 1, filteredTotal: 2 };
  const clampedData = { ...dashboard, page: 1, perPage: 1, filteredTotal: 1 };
  await withDashboard(initialData, async (input) => {
    requestedUrls.push(String(input));
    return { ok: true, json: async () => clampedData } as Response;
  }, async () => {
    await act(async () => {
      for (let attempt = 0; attempt < 10 && requestedUrls.length < 2; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    });
    assert.match(requestedUrls[0] ?? "", /[?&]page=2(?:&|$)/);
    assert.match(requestedUrls[1] ?? "", /[?&]page=1(?:&|$)/);
  });
});
