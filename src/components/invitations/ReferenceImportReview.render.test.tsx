import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "../../lib/invitations/design-recipe";
import { ReferenceImportReview } from "./ReferenceImportReview";

(globalThis as Record<string, unknown>).React = React;

test("import review exposes an editable labeled color separately from style-note wording", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ReferenceImportReview analysis={{
        schemaVersion: 3,
        referencePath: "event-1/designed_invite/reference.png",
        model: "test-model",
        createdAt: "2026-09-15T00:00:00.000Z",
        facts: [{ key: "styleNote", value: "Glamorous fascinators", confidence: 0.94, evidence: "STYLE NOTE" }],
        paletteCandidates: ["#AAB39A"],
        eventColors: [{ name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE" }],
        recipe: DEFAULT_INVITATION_DESIGN_RECIPE,
      }} onApply={() => undefined} />
    </NextIntlClientProvider>,
  );
  assert.match(html, /Style note/);
  assert.match(html, /Glamorous fascinators/);
  assert.match(html, /name="eventColorName0"[^>]*value="Sage"/);
  assert.match(html, /name="eventColorValue0"[^>]*value="#AAB39A"/);
});
