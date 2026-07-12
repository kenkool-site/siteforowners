import assert from "node:assert/strict";
import test from "node:test";
import { mergeHomeServicesConfig } from "./config-merge";

const stored = {
  trust_points: [{ id: "trusted", label_en: "Trusted", label_es: "Confiable" }],
  sections: { show_process: true, show_reviews: true },
  section_copy: {
    services: {
      title_en: "Services",
      title_es: "Servicios",
      intro_en: "Old intro",
    },
    reviews: { title_en: "Reviews", title_es: "Reseñas" },
  },
};

test("partial sections preserve unrelated visibility and config", () => {
  assert.deepEqual(
    mergeHomeServicesConfig(stored, { sections: { show_process: false } }),
    {
      ...stored,
      sections: { show_process: false, show_reviews: true },
    },
  );
});

test("one partial section-copy update preserves sibling fields and sections", () => {
  assert.deepEqual(
    mergeHomeServicesConfig(stored, {
      section_copy: { services: { title_en: "What we do" } },
    }),
    {
      ...stored,
      section_copy: {
        services: {
          title_en: "What we do",
          title_es: "Servicios",
          intro_en: "Old intro",
        },
        reviews: stored.section_copy.reviews,
      },
    },
  );
});
