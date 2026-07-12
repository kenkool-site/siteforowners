import assert from "node:assert/strict";
import test from "node:test";
import { parseZipInput, validateHomeServicesConfigUpdate, validateHomeServicesEditorConfig } from "./editor-validation";

test("validated updates preserve arbitrary unmodeled config siblings", () => {
  const result = validateHomeServicesConfigUpdate(
    { future_integration: { vendor: "acme", flags: ["a"] }, sections: { show_reviews: true } },
    { sections: { show_process: false }, coverage_summary_en: "  Downtown  " },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.future_integration, { vendor: "acme", flags: ["a"] });
  assert.equal(result.value.sections.show_reviews, true);
  assert.equal(result.value.sections.show_process, false);
  assert.equal(result.value.coverage_summary_en, "Downtown");
});

const step = (id: string) => ({ id, title_en: "Title", body_en: "Body", title_es: "Título", body_es: "Texto" });
const area = (id: string, name: string, zip_codes: string[] = []) => ({ id, name, zip_codes });

function errorFields(raw: unknown): string[] {
  const result = validateHomeServicesEditorConfig(raw);
  assert.equal(result.ok, false);
  return result.ok ? [] : result.errors.map((error) => error.field);
}

test("parseZipInput normalizes comma and newline-separated values", () => {
  assert.deepEqual(parseZipInput(" 77406, 77469-1234\n77001 ,, "), ["77406", "77469-1234", "77001"]);
});

test("rejects malformed and duplicate ZIPs with row-specific paths", () => {
  const fields = errorFields({ service_areas: [
    area("one", "Richmond", ["77406", "bad"]),
    area("two", "Katy", ["77406"]),
  ] });
  assert.ok(fields.includes("service_areas.0.zip_codes"));
  assert.ok(fields.includes("service_areas.1.zip_codes"));
});

test("rejects duplicate case-insensitive trimmed area names", () => {
  assert.ok(errorFields({ service_areas: [area("one", "Richmond"), area("two", " richmond ")] })
    .includes("service_areas.1.name"));
});

test("rejects incomplete bilingual process rows", () => {
  assert.ok(errorFields({ process_steps: [{ ...step("one"), body_es: "" }] })
    .includes("process_steps.0.body_es"));
});

test("enforces process, service-area, and per-area ZIP limits", () => {
  assert.ok(errorFields({ process_steps: Array.from({ length: 4 }, (_, index) => step(String(index))) })
    .includes("process_steps"));
  assert.ok(errorFields({ service_areas: Array.from({ length: 21 }, (_, index) => area(String(index), `Area ${index}`)) })
    .includes("service_areas"));
  assert.ok(errorFields({ service_areas: [area("one", "Richmond", Array.from({ length: 11 }, (_, index) => `77${String(index).padStart(3, "0")}`))] })
    .includes("service_areas.0.zip_codes"));
});

test("returns a normalized config when editor input is valid", () => {
  const result = validateHomeServicesEditorConfig({
    coverage_summary_en: " Serving Richmond ",
    process_steps: [step("one")],
    service_areas: [area("richmond", " Richmond ", ["77406"])],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.coverage_summary_en, "Serving Richmond");
    assert.equal(result.value.service_areas[0].name, "Richmond");
  }
});

test("rejects gallery project images that fail persisted-URL validation", () => {
  const result = validateHomeServicesEditorConfig({
    gallery_projects: [
      { id: "p1", image: "javascript:alert(1)" },
      { id: "p2", before_image: "http://192.168.1.5/x.jpg" },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const fields = result.errors.map((e) => e.field);
    assert.ok(fields.includes("gallery_projects.0.image"));
    assert.ok(fields.includes("gallery_projects.1.before_image"));
    assert.equal(result.errors[0]?.rowId, "p1");
  }
});

test("accepts local default paths, https URLs, and empty gallery image fields", () => {
  const result = validateHomeServicesEditorConfig({
    gallery_projects: [
      { id: "p1", image: "/defaults/services/home_services/lawn-mowing.jpg", caption_en: "Lawn" },
      { id: "p2", image: "https://example.com/photo.jpg" },
      { id: "p3", caption_en: "No image yet" },
    ],
  });
  assert.equal(result.ok, true);
});

test("fails closed on merged updates when stored config already has a bad gallery image url", () => {
  const result = validateHomeServicesConfigUpdate(
    { gallery_projects: [{ id: "p1", image: "javascript:alert(1)" }] },
    { coverage_summary_en: "Serving Richmond" },
  );
  assert.equal(result.ok, false);
});

test("rejects a non-list gallery_projects value", () => {
  const result = validateHomeServicesEditorConfig({ gallery_projects: "nope" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "gallery_projects"));
  }
});
