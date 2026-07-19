import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTranslateCopyRequest,
  filterTranslations,
  MAX_TRANSLATE_FIELDS,
  MAX_TRANSLATE_CHARS,
} from "./translate-copy";

test("parseTranslateCopyRequest accepts a valid body", () => {
  const result = parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: "Hello" } });
  assert.deepEqual(result, { ok: true, value: { from: "en", to: "es", texts: { a: "Hello" } } });
});

test("parseTranslateCopyRequest rejects bad locales, same locales, and bad shapes", () => {
  assert.equal(parseTranslateCopyRequest(null).ok, false);
  assert.equal(parseTranslateCopyRequest([]).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "fr", to: "es", texts: { a: "x" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "en", texts: { a: "x" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: [] }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: {} }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: "" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: 3 } }).ok, false);
});

test("parseTranslateCopyRequest enforces the field and character caps", () => {
  const many = Object.fromEntries(
    Array.from({ length: MAX_TRANSLATE_FIELDS + 1 }, (_, i) => [`k${i}`, "x"]),
  );
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: many }).ok, false);
  const big = { a: "x".repeat(MAX_TRANSLATE_CHARS + 1) };
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: big }).ok, false);
});

test("filterTranslations keeps only known keys with non-empty string values", () => {
  const input = { a: "one", b: "two" };
  assert.deepEqual(
    filterTranslations(input, { a: "uno", b: "", c: "extra", d: 4 }),
    { a: "uno" },
  );
  assert.deepEqual(filterTranslations(input, null), {});
  assert.deepEqual(filterTranslations(input, "nope"), {});
  assert.deepEqual(filterTranslations(input, ["uno"]), {});
});
