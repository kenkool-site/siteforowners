import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCategories } from "./categories";

test("validateCategories: accepts undefined (omitted field)", () => {
  const r = validateCategories(undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateCategories: accepts empty array", () => {
  const r = validateCategories([]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateCategories: trims each entry", () => {
  const r = validateCategories(["  Knotless  ", "Touch ups"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, ["Knotless", "Touch ups"]);
});

test("validateCategories: rejects non-array", () => {
  const r = validateCategories("foo");
  assert.equal(r.ok, false);
});

test("validateCategories: rejects non-string entries", () => {
  const r = validateCategories(["ok", 5, "also ok"]);
  assert.equal(r.ok, false);
});

test("validateCategories: silently drops empty/whitespace entries", () => {
  // An empty category is meaningless — there's nothing to preserve, so drop
  // it rather than failing the whole save. A stray empty entry (e.g. seeded
  // by an old import) must not block an otherwise-valid categories list.
  const r = validateCategories(["", "valid", "   ", "also valid"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, ["valid", "also valid"]);
});

test("validateCategories: rejects > 60 chars", () => {
  const r = validateCategories(["x".repeat(61)]);
  assert.equal(r.ok, false);
});

test("validateCategories: rejects > 10 entries", () => {
  const r = validateCategories(Array(11).fill(0).map((_, i) => `c${i}`));
  assert.equal(r.ok, false);
});

test("validateCategories: rejects duplicates (case-insensitive after trim)", () => {
  const r = validateCategories(["Knotless", "knotless"]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors[0].reason, /duplicate/i);
});
