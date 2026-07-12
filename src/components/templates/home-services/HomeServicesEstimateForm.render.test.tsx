import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { HomeServicesEstimateForm } from "./HomeServicesEstimateForm";

function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof window.HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("correcting an invalid photo submits preview_mock successfully on the first click", async () => {
  const globalNames = ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Event", "File", "FormData", "React", "IS_REACT_ACT_ENVIRONMENT", "navigator"] as const;
  const originalGlobals = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("controlled input to be uncontrolled")) return;
    originalConsoleError(...args);
  };
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    File: dom.window.File,
    FormData: dom.window.FormData,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  let root: import("react-dom/client").Root | null = null;
  try {
    const { createRoot } = await import("react-dom/client");
    const container = document.querySelector("#root")!;
    const mountedRoot = createRoot(container);
    root = mountedRoot;
    let completions = 0;

  await act(async () => {
    mountedRoot.render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
        <HomeServicesEstimateForm
          services={[{ client_id: "svc-1", name: "Roof repair" } as never]}
          service="Roof repair"
          colors={{ foreground: "#111111", muted: "#ffffff", secondary: "#eeeeee" } as never}
          deliveryMode="preview_mock"
          onComplete={() => {
            completions += 1;
          }}
        />
      </NextIntlClientProvider>,
    );
  });

  await act(async () => {
    change(document.querySelector<HTMLInputElement>('input[name="name"]')!, "Alex");
    change(document.querySelector<HTMLInputElement>('input[name="phone"]')!, "555-0100");
    change(document.querySelector<HTMLInputElement>('input[name="location"]')!, "10001");
    document.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
  });

  const photoInput = document.querySelector<HTMLInputElement>('input[name="photos"]')!;
  const invalidPhoto = new File(["not an image"], "job.txt", { type: "text/plain" });
  Object.defineProperty(photoInput, "files", { configurable: true, value: [invalidPhoto] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  assert.match(document.querySelector('[role="alert"]')!.textContent!, /JPEG, PNG, or WebP/i);

  const validPhoto = new File([new Uint8Array([0xff, 0xd8, 0xff])], "job.jpg", {
    type: "image/jpeg",
  });
  Object.defineProperty(photoInput, "files", { configurable: true, value: [validPhoto] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  assert.equal(document.querySelector('[role="alert"]'), null);

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button:not([type="button"])')!.click();
    await new Promise((resolve) => setTimeout(resolve, 550));
  });
  assert.equal(completions, 1, "the first Submit click should reach preview success");

  } finally {
    const mountedRoot = root;
    if (mountedRoot) await act(async () => mountedRoot.unmount());
    dom.window.close();
    console.error = originalConsoleError;
    for (const name of globalNames) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
