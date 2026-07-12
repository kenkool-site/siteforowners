import assert from "node:assert/strict";
import test from "node:test";
import { parseZipInput, validateHomeServicesEditorConfig } from "./editor-validation";

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
