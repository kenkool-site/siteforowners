import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import type { EditorEvent } from "./EventEditor";
import type { InvitationMediaSnapshot } from "../../lib/invitations/media";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "../../lib/invitations/design-recipe";

(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

const baseEvent: EditorEvent = {
  id: "event-1",
  ownerId: "owner-1",
  slug: "ana-and-luis",
  publicSubdomain: null,
  eventType: "wedding",
  locale: "en",
  title: "Ana & Luis",
  honoreeNames: "Ana and Luis",
  description: "Join us to celebrate.",
  startsAt: "2026-10-20T22:00:00.000Z",
  endsAt: null,
  timezone: "America/New_York",
  venueName: "The Foundry",
  address: "42 Celebration Way",
  mapUrl: null,
  themeKey: "editorial",
  primaryColor: "#2B2231",
  accentColor: "#6D456F",
  fontPairKey: "fraunces-geist",
  designRecipe: null,
  referenceAnalysis: null,
  designedInvitePath: "event-1/invite.jpg",
  coverImagePath: null,
  videoPath: null,
  showPublicRsvpCount: false,
  capacity: 120,
  rsvpDeadline: null,
  submissionLimit: 250,
  emailNotificationLimit: 250,
  smsNotificationLimit: 50,
  ownerEmailNotifications: true,
  ownerSmsNotifications: false,
  notificationEmail: "ana@example.com",
  notificationPhone: null,
  guestEmailConfirmations: true,
  status: "draft",
  expireAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  owner: {
    id: "owner-1",
    name: "Ana",
    email: "ana@example.com",
    phone: null,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

async function withEditor(
  mode: "owner" | "founder",
  fetchImpl: typeof fetch,
  run: (container: HTMLElement, dom: JSDOM) => Promise<void>,
  options: { media?: InvitationMediaSnapshot; XMLHttpRequest?: typeof XMLHttpRequest } = {},
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.example.test" });
  const names = [
    "window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement",
    "HTMLFormElement", "Event", "FormData", "File", "XMLHttpRequest", "navigator", "fetch", "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    Event: dom.window.Event,
    FormData: dom.window.FormData,
    File: dom.window.File,
    XMLHttpRequest: options.XMLHttpRequest ?? dom.window.XMLHttpRequest,
    fetch: fetchImpl,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  let root: Root | null = null;
  try {
    const container = dom.window.document.querySelector<HTMLElement>("#root")!;
    const { createRoot } = await import("react-dom/client");
    const { EventEditor } = await import("./EventEditor");
    root = createRoot(container) as Root;
    await act(async () => root!.render(
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
        <EventEditor event={baseEvent} mode={mode} media={options.media} />
      </NextIntlClientProvider>,
    ));
    await run(container, dom);
    await act(async () => root!.unmount());
    root = null;
  } finally {
    if (root) await act(async () => root!.unmount());
    originals.forEach((descriptor, name) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

function setInput(dom: JSDOM, input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function setTextarea(dom: JSDOM, textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  textarea.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function submit(dom: JSDOM, form: HTMLFormElement) {
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

test("capacity below attendance reports the corrective action beside the capacity field", async () => {
  await withEditor("owner", async () => response({ errors: { capacity: "below_attendance" } }, false), async (container, dom) => {
    const input = container.querySelector<HTMLInputElement>('input[name="capacity"]')!;
    await act(async () => { setInput(dom, input, "1"); submit(dom, input.form!); });
    assert.match(container.textContent ?? "", /Capacity cannot be lower than current attendance/);
  });
});

test("editing is disabled while a save request is pending", async () => {
  let finish: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  await withEditor("owner", async () => pending, async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const form = title.form!;
    await act(async () => setInput(dom, title, "Submitted title"));
    await act(async () => submit(dom, form));
    assert.equal(title.matches(":disabled"), true);
    await act(async () => {
      finish?.(response({ event: { ...baseEvent, title: "Submitted title", updatedAt: "2026-09-02T00:00:00.000Z" } }));
      await pending;
      await Promise.resolve();
    });
    assert.match(container.textContent ?? "", /Changes saved/);
  });
});

test("dirty editor blocks lifecycle actions until Save completes", async () => {
  let statusCalls = 0;
  await withEditor("owner", async (input) => {
    if (String(input).endsWith("/status")) statusCalls += 1;
    return response({});
  }, async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => setInput(dom, title, "Unsaved title"));
    const publish = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Publish invitation")!;
    assert.equal(publish.disabled, true);
    assert.match(container.textContent ?? "", /Save your changes before changing the invitation status/);
    await act(async () => publish.click());
    assert.equal(statusCalls, 0);
  });
});

test("successful save reconciles normalized event details into inputs and preview", async () => {
  const normalized = {
    ...baseEvent,
    eventType: "anniversary",
    title: "Ten years together",
    timezone: "America/Chicago",
    startsAt: "2026-10-21T00:00:00.000Z",
    venueName: "New Hall",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
  await withEditor("owner", async () => response({ event: normalized }), async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => setInput(dom, title, "Ten years together"));
    await act(async () => {
      submit(dom, title.form!);
      await Promise.resolve();
      await Promise.resolve();
    });
    const preview = container.querySelector<HTMLElement>('[data-mobile-preview="true"]')!;
    assert.match(preview.textContent ?? "", /anniversary/);
    assert.match(preview.textContent ?? "", /New Hall/);
    assert.match(preview.textContent ?? "", /7:00 PM/);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="timezone"]')?.value, "America/Chicago");
    assert.equal(container.querySelector<HTMLInputElement>('input[name="venueName"]')?.value, "New Hall");
  });
});

test("founder save submits the editable public subdomain", async () => {
  let submitted: Record<string, unknown> | null = null;
  await withEditor("founder", async (_url, init) => {
    submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response({ event: { ...baseEvent, publicSubdomain: "ana-luis" } });
  }, async (container, dom) => {
    const input = container.querySelector<HTMLInputElement>('input[name="publicSubdomain"]')!;
    await act(async () => setInput(dom, input, "ana-luis"));
    await act(async () => {
      submit(dom, input.form!);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(submitted?.publicSubdomain, "ana-luis");
  });
});

test("applying analyzed style guidance keeps it structured in the event save", async () => {
  let submitted: Record<string, unknown> | null = null;
  await withEditor("owner", async (input, init) => {
    if (String(input).endsWith("/analyze-reference")) return response({ analysis: {
      schemaVersion: 3,
      referencePath: "event-1/designed_invite/reference.png",
      model: "test-model",
      createdAt: "2026-09-15T00:00:00.000Z",
      facts: [{ key: "styleNote", value: "Glamorous fascinators", confidence: 0.94, evidence: "STYLE NOTE" }],
      paletteCandidates: ["#AAB39A"],
      eventColors: [{ name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE" }],
      recipe: DEFAULT_INVITATION_DESIGN_RECIPE,
    } });
    submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response({ event: { ...baseEvent, styleGuide: submitted.styleGuide } });
  }, async (container, dom) => {
    const analyze = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Analyze invitation")!;
    await act(async () => { analyze.click(); await Promise.resolve(); await Promise.resolve(); });
    const apply = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply selected")!;
    await act(async () => { apply.click(); await Promise.resolve(); });
    const form = container.querySelector<HTMLFormElement>('form[data-event-form="true"]')!;
    await act(async () => { submit(dom, form); await Promise.resolve(); await Promise.resolve(); });
    assert.deepEqual(submitted?.styleGuide, {
      note: "Glamorous fascinators",
      colors: [{ name: "Sage", color: "#AAB39A" }],
    });
  });
});

test("a style-guide validation error is shown as helpful copy instead of a translation key", async () => {
  await withEditor("owner", async () => response({ errors: { styleGuide: "invalid" } }, false), async (container, dom) => {
    const floral = container.querySelector<HTMLInputElement>('input[name="coverFrameStyle"][value="floral"]')!;
    await act(async () => floral.click());
    await act(async () => {
      submit(dom, floral.form!);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(container.textContent ?? "", /Check the style note and event colors/i);
    assert.doesNotMatch(container.textContent ?? "", /invitations\.editor\.errors\.styleGuide/);
  });
});

test("owner can add a flexible section and save its heading and multiline content", async () => {
  let submitted: Record<string, unknown> | null = null;
  await withEditor("owner", async (_input, init) => {
    submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response({ event: { ...baseEvent, additionalSections: submitted.additionalSections } });
  }, async (container, dom) => {
    const add = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Add section")!;
    await act(async () => add.click());
    const heading = container.querySelector<HTMLInputElement>('input[name="additionalSectionHeading0"]')!;
    const content = container.querySelector<HTMLTextAreaElement>('textarea[name="additionalSectionContent0"]')!;
    await act(async () => {
      setInput(dom, heading, "Wedding Day Schedule");
      setTextarea(dom, content, "Ceremony @ 1pm\nReception @ 3:30pm");
    });
    await act(async () => {
      submit(dom, heading.form!);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.deepEqual(submitted?.additionalSections, [{
      heading: "Wedding Day Schedule",
      content: "Ceremony @ 1pm\nReception @ 3:30pm",
    }]);
  });
});

test("duplicate owner email fails only the separate credential action", async () => {
  await withEditor("founder", async (input) => {
    assert.match(String(input), /\/credentials$/);
    return response({ errors: { ownerEmailTaken: "duplicate" } }, false);
  }, async (container, dom) => {
    const eventForm = container.querySelector<HTMLFormElement>('form[data-event-form="true"]')!;
    const credentialsForm = container.querySelector<HTMLFormElement>('form[data-credentials-form="true"]')!;
    assert.ok(eventForm);
    assert.ok(credentialsForm);
    assert.equal(eventForm.querySelector('input[name="ownerEmail"]'), null);
    const ownerEmail = credentialsForm.querySelector<HTMLInputElement>('input[name="ownerEmail"]')!;
    await act(async () => setInput(dom, ownerEmail, "duplicate@example.com"));
    assert.match(credentialsForm.textContent ?? "", /Unsaved changes/);
    assert.equal(credentialsForm.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled, false);
    await act(async () => {
      submit(dom, credentialsForm);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(credentialsForm.textContent ?? "", /already in use/);
    assert.match(credentialsForm.textContent ?? "", /Unsaved changes/);
    assert.match(eventForm.textContent ?? "", /No unsaved changes/);
  });
});

test("accepted credential save clears credential dirtiness and the sensitive PIN", async () => {
  let finish: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  const savedEvent = {
    ...baseEvent,
    updatedAt: "2026-09-04T00:00:00.000Z",
    owner: { ...baseEvent.owner, name: "Luis", updatedAt: "2026-09-04T00:00:00.000Z" },
  };
  await withEditor("founder", async (input) => {
    assert.match(String(input), /\/credentials$/);
    return pending;
  }, async (container, dom) => {
    const credentialsForm = container.querySelector<HTMLFormElement>('form[data-credentials-form="true"]')!;
    const ownerName = credentialsForm.querySelector<HTMLInputElement>('input[name="ownerName"]')!;
    const pin = credentialsForm.querySelector<HTMLInputElement>('input[name="newOwnerPin"]')!;
    await act(async () => {
      setInput(dom, ownerName, "Luis");
      setInput(dom, pin, "654321");
    });
    assert.match(credentialsForm.textContent ?? "", /Unsaved changes/);
    await act(async () => submit(dom, credentialsForm));
    assert.match(credentialsForm.textContent ?? "", /Saving…/);
    await Promise.resolve();
    const resolvePending = finish;
    if (!resolvePending) throw new Error("credential request did not start");
    await act(async () => {
      resolvePending(response({ event: savedEvent }));
      await pending;
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const savedCredentialsForm = container.querySelector<HTMLFormElement>('form[data-credentials-form="true"]')!;
    const savedEventForm = container.querySelector<HTMLFormElement>('form[data-event-form="true"]')!;
    assert.match(savedCredentialsForm.textContent ?? "", /Changes saved/);
    assert.doesNotMatch(savedCredentialsForm.textContent ?? "", /Unsaved changes/);
    assert.equal(savedCredentialsForm.querySelector<HTMLInputElement>('input[name="newOwnerPin"]')?.value, "");
    assert.match(savedEventForm.textContent ?? "", /No unsaved changes/);
  });
});

const coverMedia: InvitationMediaSnapshot = {
  designedInvite: null,
  cover: { kind: "cover", path: "event-1/cover/old.png", url: "https://signed.test/old" },
  video: null,
  gallery: [],
};

function mediaMutation(cover: InvitationMediaSnapshot["cover"], updatedAt: string) {
  return {
    event: { ...baseEvent, coverImagePath: cover?.path ?? null, updatedAt },
    media: { ...coverMedia, cover },
  };
}

test("removing singleton media preserves dirty title and venue drafts", async () => {
  await withEditor("owner", async () => response(mediaMutation(null, "2026-09-05T00:00:00.000Z")), async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const venue = container.querySelector<HTMLInputElement>('input[name="venueName"]')!;
    await act(async () => {
      setInput(dom, title, "Dirty title");
      setInput(dom, venue, "Dirty venue");
    });
    const remove = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Remove")!;
    await act(async () => {
      remove.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(container.querySelector<HTMLInputElement>('input[name="title"]')?.value, "Dirty title");
    assert.equal(container.querySelector<HTMLInputElement>('input[name="venueName"]')?.value, "Dirty venue");
    assert.match(container.querySelector<HTMLFormElement>('form[data-event-form="true"]')?.textContent ?? "", /Unsaved changes/);
  }, { media: coverMedia });
});

test("uploading singleton media preserves dirty title and venue drafts", async () => {
  const uploadedCover = { kind: "cover" as const, path: "event-1/cover/new.png", url: "https://signed.test/new" };
  class SuccessfulUploadRequest {
    status = 200;
    responseText = JSON.stringify(mediaMutation(uploadedCover, "2026-09-06T00:00:00.000Z"));
    withCredentials = false;
    private listeners = new Map<string, EventListener>();
    upload = { addEventListener: () => undefined };
    open(method: string, url: string) { assert.equal(method, "PUT"); assert.equal(url, "https://private-storage.test/signed-upload"); }
    setRequestHeader() {}
    addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener); }
    send() {
      queueMicrotask(() => this.listeners.get("load")?.(new Event("load")));
    }
  }
  const actions: string[] = [];
  await withEditor("owner", async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { action: string; ticket?: string };
    actions.push(body.action);
    if (body.action === "initiate") return response({ uploadUrl: "https://private-storage.test/signed-upload", ticket: "signed-ticket" });
    assert.equal(body.ticket, "signed-ticket");
    return response(mediaMutation(uploadedCover, "2026-09-06T00:00:00.000Z"));
  }, async (container, dom) => {
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const venue = container.querySelector<HTMLInputElement>('input[name="venueName"]')!;
    await act(async () => {
      setInput(dom, title, "Dirty title");
      setInput(dom, venue, "Dirty venue");
    });
    const input = container.querySelector<HTMLInputElement>("#invitation-media-cover")!;
    Object.defineProperty(input, "files", { configurable: true, value: [new dom.window.File(["png"], "cover.png", { type: "image/png" })] });
    await act(async () => {
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(container.querySelector<HTMLInputElement>('input[name="title"]')?.value, "Dirty title");
    assert.equal(container.querySelector<HTMLInputElement>('input[name="venueName"]')?.value, "Dirty venue");
    assert.match(container.querySelector<HTMLFormElement>('form[data-event-form="true"]')?.textContent ?? "", /Unsaved changes/);
    assert.deepEqual(actions, ["initiate", "finalize"]);
  }, { XMLHttpRequest: SuccessfulUploadRequest as unknown as typeof XMLHttpRequest });
});
