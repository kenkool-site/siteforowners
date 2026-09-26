import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM } from "jsdom";
import enMessages from "../../../../messages/en.json";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import type { EventScheduleItem } from "@/lib/invitations/event-schedule";

Object.assign(globalThis, { React });

const GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "Event",
  "navigator",
  "IS_REACT_ACT_ENVIRONMENT",
  "fetch",
] as const;

function moment(overrides: Partial<MemoryMoment> = {}): MemoryMoment {
  return {
    id: "moment-1",
    name: "Ceremony",
    startsAt: "2026-09-24T16:00:00.000Z",
    endsAt: "2026-09-24T17:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

type FetchCall = { url: string; method: string; body: unknown };

async function withMountedComponent(
  initialMoments: MemoryMoment[],
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  callback: (ctx: { dom: JSDOM; calls: FetchCall[] }) => Promise<void>,
  initialEventSchedule: EventScheduleItem[] = [],
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
  dom.window.confirm = () => true;

  const { createRoot } = await import("react-dom/client");
  const { OwnerMomentsManager } = await import("./OwnerMomentsManager");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <OwnerMomentsManager eventId="event-1" initialMoments={initialMoments} initialEventSchedule={initialEventSchedule} />
        </NextIntlClientProvider>,
      );
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function click(dom: JSDOM, element: Element | null) {
  assert.ok(element, "expected element to exist before clicking");
  (element as HTMLElement).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

// Matches OwnerHighlightsManager.test.tsx's own proven, zero-act()-warning
// flush pattern for a multi-hop async chain (fetch -> .json() -> setState).
function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setValue(dom: JSDOM, element: Element | null, value: string) {
  assert.ok(element, "expected input to exist");
  const input = element as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function byText(dom: JSDOM, selector: string, text: string): HTMLElement | null {
  const candidates = Array.from(dom.window.document.querySelectorAll(selector));
  return (candidates.find((el) => el.textContent?.trim() === text) as HTMLElement | undefined) ?? null;
}

test("module loads under tsx --test", async () => {
  const mod = await import("./OwnerMomentsManager");
  assert.equal(typeof mod.OwnerMomentsManager, "function");
});

test("renders existing moments with Edit and Delete controls", async () => {
  await withMountedComponent([moment({ name: "Cake Cutting" })], async () => jsonResponse({}), async ({ dom }) => {
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /Cake Cutting/);
    assert.ok(byText(dom, "button", "Edit"), "expected an Edit control");
    assert.ok(byText(dom, "button", "Delete"), "expected a Delete control");
  });
});

test("clicking Edit pre-fills the form with the moment's current name and Save PATCHes the change", async () => {
  await withMountedComponent(
    [moment({ id: "moment-1", name: "Ceremony" })],
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      await act(async () => {
        click(dom, byText(dom, "button", "Edit"));
        await flush();
      });

      const nameInput = dom.window.document.querySelector('input[type="text"]') as HTMLInputElement | null;
      assert.equal(nameInput?.value, "Ceremony", "expected the edit form pre-filled with the current name");

      await act(async () => {
        setValue(dom, nameInput, "Church Service");
        await flush();
      });

      await act(async () => {
        click(dom, byText(dom, "button", "Save"));
        await flush();
      });

      const patchCall = calls.find((c) => c.method === "PATCH");
      assert.ok(patchCall, "expected a PATCH request");
      assert.equal((patchCall!.body as { id: string }).id, "moment-1");
      assert.equal((patchCall!.body as { name: string }).name, "Church Service");

      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Church Service/);
      assert.ok(!byText(dom, "button", "Save"), "expected to exit edit mode after a successful save");
    },
  );
});

test("Cancel discards edits without sending a request", async () => {
  await withMountedComponent([moment({ name: "Ceremony" })], async () => jsonResponse({}), async ({ dom, calls }) => {
    await act(async () => {
      click(dom, byText(dom, "button", "Edit"));
      await flush();
    });

    const nameInput = dom.window.document.querySelector('input[type="text"]') as HTMLInputElement | null;
    await act(async () => {
      setValue(dom, nameInput, "Something Else");
      await flush();
    });

    await act(async () => {
      click(dom, byText(dom, "button", "Cancel"));
      await flush();
    });

    assert.ok(!calls.some((c) => c.method === "PATCH"), "Cancel must not send a request");
    const text = dom.window.document.body.textContent ?? "";
    assert.match(text, /Ceremony/);
    assert.doesNotMatch(text, /Something Else/);
  });
});

test("Delete asks for confirmation, then DELETEs and removes the moment from the list", async () => {
  // "Cake Cutting", not "Ceremony" — the section's own static description
  // text uses "Ceremony" as an example, which would make a substring
  // assertion pass or fail for the wrong reason.
  await withMountedComponent(
    [moment({ id: "moment-1", name: "Cake Cutting" })],
    async () => jsonResponse({ ok: true }),
    async ({ dom, calls }) => {
      await act(async () => {
        click(dom, byText(dom, "button", "Delete"));
        await flush();
      });

      const deleteCall = calls.find((c) => c.method === "DELETE");
      assert.ok(deleteCall, "expected a DELETE request");
      assert.equal((deleteCall!.body as { id: string }).id, "moment-1");

      const text = dom.window.document.body.textContent ?? "";
      assert.doesNotMatch(text, /Cake Cutting/);
      assert.match(text, /No moments yet/);
    },
  );
});

test("Delete does nothing if the host cancels the confirmation dialog", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: FetchCall[] = [];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", body: undefined });
      return jsonResponse({ ok: true });
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.confirm = () => false;

  const { createRoot } = await import("react-dom/client");
  const { OwnerMomentsManager } = await import("./OwnerMomentsManager");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <OwnerMomentsManager eventId="event-1" initialMoments={[moment({ name: "Ceremony" })]} initialEventSchedule={[]} />
        </NextIntlClientProvider>,
      );
    });
    await act(async () => {
      click(dom, byText(dom, "button", "Delete"));
      await flush();
    });
    assert.ok(!calls.some((c) => c.method === "DELETE"), "a cancelled confirmation must not send a request");
    assert.match(dom.window.document.body.textContent ?? "", /Ceremony/);
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
});

test("Save rejects a blank name locally, without sending a request", async () => {
  await withMountedComponent([moment({ name: "Ceremony" })], async () => jsonResponse({}), async ({ dom, calls }) => {
    await act(async () => {
      click(dom, byText(dom, "button", "Edit"));
      await flush();
    });

    const nameInput = dom.window.document.querySelector('input[type="text"]') as HTMLInputElement | null;
    await act(async () => {
      setValue(dom, nameInput, "   ");
      await flush();
    });

    await act(async () => {
      click(dom, byText(dom, "button", "Save"));
      await flush();
    });

    assert.ok(!calls.some((c) => c.method === "PATCH"), "a blank name must be rejected before any request");
    assert.match(dom.window.document.body.textContent ?? "", /Name is required/);
  });
});

test("Create Moments from your Event Schedule posts one create-moment request per checked item, using each item's inferred range", async () => {
  const schedule = [
    { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:30:00.000Z" },
  ];
  await withMountedComponent(
    [],
    async (url, init) => {
      if (init?.method === "POST") return jsonResponse({ moment: { id: "new-moment", name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T18:30:00.000Z", sortOrder: 0 } });
      return jsonResponse({});
    },
    async ({ dom, calls }) => {
      const ceremonyCheckbox = Array.from(dom.window.document.querySelectorAll('input[type="checkbox"]'))[0] as HTMLInputElement;
      click(dom, ceremonyCheckbox);
      await flush();

      click(dom, byText(dom, "button", "Add selected as Moments"));
      await flush();

      const postCalls = calls.filter((c) => c.method === "POST");
      assert.equal(postCalls.length, 1, "expected exactly one create-moment request for the one checked item");
      assert.equal((postCalls[0].body as { name: string }).name, "Ceremony");
      assert.equal((postCalls[0].body as { startsAt: string }).startsAt, "2026-10-03T17:00:00.000Z");
      assert.equal((postCalls[0].body as { endsAt: string }).endsAt, "2026-10-03T18:30:00.000Z");
      assert.ok(!calls.some((c) => c.method === "PATCH"), "creating Moments from the schedule must never write back to event_schedule");
    },
    schedule,
  );
});

test("a partial failure across multiple selected items only leaves the failed item checked — the succeeded item's Moment appears and its checkbox clears", async () => {
  const schedule = [
    { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:30:00.000Z" },
  ];
  let postCount = 0;
  await withMountedComponent(
    [],
    async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        // First POST (Ceremony) succeeds; second POST (Cocktail Hour)
        // fails — simulates a transient error partway through a
        // multi-item create so the checkbox/state handling for the item
        // that already succeeded can be verified independently of the
        // one that didn't.
        if (postCount === 1) {
          return jsonResponse({ moment: { id: "new-moment", name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T18:30:00.000Z", sortOrder: 0 } });
        }
        return jsonResponse({ error: "boom" }, 500);
      }
      return jsonResponse({});
    },
    async ({ dom, calls }) => {
      const checkboxes = Array.from(dom.window.document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      click(dom, checkboxes[0]);
      await flush();
      click(dom, checkboxes[1]);
      await flush();

      click(dom, byText(dom, "button", "Add selected as Moments"));
      await flush();

      const postCalls = calls.filter((c) => c.method === "POST");
      assert.equal(postCalls.length, 2, "expected a create-moment request for each checked item, in order");
      assert.ok(!calls.some((c) => c.method === "PATCH"), "creating Moments from the schedule must never write back to event_schedule");

      assert.ok(
        dom.window.document.querySelector('button[aria-label="Edit Ceremony"]'),
        "expected the succeeded item's Moment to appear in the rendered moments list, not be discarded by the later failure",
      );

      const [ceremonyCheckbox, cocktailCheckbox] = Array.from(
        dom.window.document.querySelectorAll('input[type="checkbox"]'),
      ) as HTMLInputElement[];
      assert.equal(ceremonyCheckbox.checked, false, "the succeeded item's checkbox must clear so a retry can't duplicate it");
      assert.equal(cocktailCheckbox.checked, true, "the failed item's checkbox must remain checked so a retry can re-attempt only it");

      assert.match(dom.window.document.body.textContent ?? "", /Could not create those Moments/, "expected the failure to surface an error");
    },
    schedule,
  );
});
