import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";

// tsx compiles JSX with the classic runtime; React must be in scope globally
// (same pattern as ClientActions.render.test.tsx).
(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

async function withRenderedLeadActions(
  props: {
    demoTenant: { id: string; site_published: boolean } | null;
    converted?: boolean;
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
    const { LeadActions } = await import("./LeadActions");
    root = createRoot(container) as Root;
    await act(async () => {
      root!.render(
        <LeadActions
          leadId="l1"
          previewSlug="test-salon-abc123"
          businessName="Test Salon"
          ownerName="Pat Owner"
          phone="5551234567"
          email={null}
          converted={props.converted ?? false}
          demoTenant={props.demoTenant}
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

test("lead with a published demo shows Take Offline", async () => {
  await withRenderedLeadActions(
    { demoTenant: { id: "t1", site_published: true } },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Take Offline"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Bring Online"));
    },
  );
});

test("lead with an offline demo shows Bring Online", async () => {
  await withRenderedLeadActions(
    { demoTenant: { id: "t1", site_published: false } },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Bring Online"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Take Offline"));
    },
  );
});

test("lead with no promoted demo gets no toggle, keeps existing actions", async () => {
  await withRenderedLeadActions({ demoTenant: null }, (container) => {
    const labels = buttonLabels(container);
    assert.ok(!labels.includes("Take Offline"));
    assert.ok(!labels.includes("Bring Online"));
    assert.ok(labels.includes("Onboard"), `got: ${labels.join(", ")}`);
  });
});
