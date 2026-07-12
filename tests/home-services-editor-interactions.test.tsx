import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HomeServicesConfig } from "@/lib/home-services/types";
import { validateHomeServicesEditorConfig } from "@/lib/home-services/editor-validation";
import { HomeServicesContentEditor } from "@/app/(admin)/clients/[tenantId]/edit/HomeServicesContentEditor";

const config: HomeServicesConfig = {
  trust_points: [],
  gallery_projects: [],
  why_us_points: [],
  section_copy: {},
  process_steps: [
    {
      id: "first",
      title_en: "One",
      body_en: "Body",
      title_es: "Uno",
      body_es: "Cuerpo",
    },
    {
      id: "second",
      title_en: "Two",
      body_en: "Body",
      title_es: "Dos",
      body_es: "Cuerpo",
    },
  ],
  service_areas: [
    { id: "north", name: "North", zip_codes: ["10001"] },
    { id: "south", name: "South", zip_codes: ["20002"] },
  ],
  coverage_summary_en: "",
  coverage_summary_es: "",
  message_links: {},
  sections: {},
};

test("rendered editor retains raw ZIP drafts and keeps row errors stable through reorder", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let latest = config;
  function Harness() {
    const [value, setValue] = useState(config);
    latest = value;
    const validation = validateHomeServicesEditorConfig(value);
    return (
      <HomeServicesContentEditor
        config={value}
        rowErrors={validation.ok ? [] : validation.errors}
        onChange={setValue}
      />
    );
  }
  const root = createRoot(document.querySelector("#root")!);
  await act(async () => root.render(<Harness />));
  const textarea = document.querySelector("textarea")!;
  Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(textarea, "10001,\nBAD");
  await act(async () =>
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true })),
  );
  assert.equal(textarea.value, "10001,\nBAD");
  assert.deepEqual(latest.service_areas[0].zip_codes, ["10001"]);
  await act(async () =>
    textarea.dispatchEvent(new dom.window.Event("focusout", { bubbles: true })),
  );
  assert.deepEqual(latest.service_areas[0].zip_codes, ["10001", "BAD"]);
  assert.equal(document.querySelector("textarea")!.value, "10001,\nBAD");
  assert.match(document.body.textContent!, /Invalid ZIP code: BAD/);

  const buttons = Array.from(document.querySelectorAll("button"));
  const firstUp = buttons.find((button) => button.textContent === "Up")!;
  assert.equal(firstUp.disabled, true);
  assert.match(firstUp.className, /min-h-11/);
  const firstDown = buttons.find((button) => button.textContent === "Down")!;
  await act(async () => firstDown.click());
  assert.equal(latest.process_steps[0].id, "second");
  assert.match(document.body.textContent!, /Invalid ZIP code: BAD/);

  const addArea = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Add service area",
  )!;
  await act(async () => addArea.click());
  assert.equal(latest.service_areas.length, 3);
  const areaDown = Array.from(document.querySelectorAll("button")).filter(
    (button) => button.textContent === "Down",
  )[2];
  await act(async () => areaDown.click());
  assert.equal(latest.service_areas[1].id, "north");
  const invalidText = Array.from(document.querySelectorAll("p")).find((node) =>
    node.textContent?.includes("Invalid ZIP code: BAD"),
  )!;
  assert.equal(
    invalidText.parentElement!.querySelector("input")!.value,
    "North",
  );
  const removes = Array.from(document.querySelectorAll("button")).filter(
    (button) => button.textContent === "Remove",
  );
  await act(async () => removes.at(-1)!.click());
  assert.equal(latest.service_areas.length, 2);
  await act(async () => root.unmount());
});
