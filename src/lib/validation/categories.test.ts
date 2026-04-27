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

test("validateCategories: rejects empty after trim", () => {
  const r = validateCategories(["valid", "   "]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0].field, "categories[1]");
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
