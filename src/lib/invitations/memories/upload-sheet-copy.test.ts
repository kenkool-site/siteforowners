import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "use-intl";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { formatMediaSummary } from "./upload-sheet-copy";

function translator(messages: typeof enMessages, locale: "en" | "es") {
  return createTranslator({ locale, messages, namespace: "invitations.public.memories.redesign" });
}

function summary(locale: "en" | "es", photos: number, videos: number): string {
  const messages = locale === "en" ? enMessages : esMessages;
  const t = translator(messages, locale);
  return formatMediaSummary(photos, videos, {
    photos: (count) => t("countPhotos", { count }),
    videos: (count) => t("countVideos", { count }),
    join: (left, right) => t("joinMedia", { left, right }),
  });
}

test("the upload sheet names a single video, and mixes photos and videos with a real plural", () => {
  const t = translator(enMessages, "en");
  assert.equal(t("addMedia", { summary: summary("en", 0, 1) }), "Add 1 video");
  assert.equal(t("addMedia", { summary: summary("en", 2, 1) }), "Add 2 photos & 1 video");
  assert.equal(t("addingMedia", { summary: summary("en", 0, 1) }), "Adding 1 video");
  assert.equal(t("addingMedia", { summary: summary("en", 1, 0) }), "Adding 1 photo");
  assert.equal(t("nameHint"), "Remembered on this phone. Shown on what you share.");
  assert.match(t("whoSeesBodyMedia", { event: "Mercy & John" }), /remove anything/);
  assert.match(t("finePrintMedia"), /remove anything/);
});

test("Spanish upload copy pluralizes and joins with y", () => {
  const t = translator(esMessages, "es");
  assert.equal(t("addMedia", { summary: summary("es", 0, 1) }), "Agregar 1 video");
  assert.equal(t("addMedia", { summary: summary("es", 2, 1) }), "Agregar 2 fotos y 1 video");
  assert.equal(t("addingMedia", { summary: summary("es", 0, 1) }), "Agregando 1 video");
  assert.match(t("nameHint"), /lo que compartes/);
  assert.match(t("whoSeesBodyMedia", { event: "Mercy & John" }), /quitar lo que sea/);
});
