import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";

// tsx compiles JSX with the classic runtime; React must be in scope globally
// (same pattern as ServicesSection.render.test.tsx).
(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

async function withRenderedActions(
  props: {
    sitePublished: boolean;
    isDemo: boolean;
    subdomain: string | null;
  },
  run: (container: HTMLElement) => void | Promise<void>,
) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost" },
  );
  const globalNames = [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "Event",
    "navigator",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originals = new Map(
    globalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });

  let root: Root | null = null;
  try {
    const container = dom.window.document.getElementById("root")!;
    const { createRoot } = await import("react-dom/client");
    const { ClientActions } = await import("./ClientActions");
    root = createRoot(container) as Root;
    await act(async () => {
      root!.render(
        <ClientActions
          tenantId="t1"
          businessName="Test Salon"
          subdomain={props.subdomain}
          customDomain={null}
          sitePublished={props.sitePublished}
          isDemo={props.isDemo}
        />,
      );
    });
    await run(container as unknown as HTMLElement);
    await act(async () => {
      root!.unmount();
    });
    root = null;
  } finally {
    if (root) await act(async () => root!.unmount());
    originals.forEach((desc, name) => {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

function buttonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button")).map(
    (b) => b.textContent ?? "",
  );
}

test("published demo shows Take Offline", async () => {
  await withRenderedActions(
    { sitePublished: true, isDemo: true, subdomain: "test-salon" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Take Offline"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Bring Online"));
    },
  );
});

test("offline demo (has subdomain, unpublished) shows Bring Online and grayed URL, hides Publish", async () => {
  await withRenderedActions(
    { sitePublished: false, isDemo: true, subdomain: "test-salon" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Bring Online"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Take Offline"));
      assert.ok(!labels.includes("Publish"), "Publish flow must be hidden for offline demos");
      assert.ok(
        (container.textContent ?? "").includes("test-salon.siteforowners.com"),
        "offline URL should still be visible (grayed out)",
      );
    },
  );
});

test("real client rows never get the offline toggle", async () => {
  await withRenderedActions(
    { sitePublished: true, isDemo: false, subdomain: "paying-client" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(!labels.includes("Take Offline"));
      assert.ok(!labels.includes("Bring Online"));
    },
  );
});
