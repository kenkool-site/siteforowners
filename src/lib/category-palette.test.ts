import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryPaletteIndex, CATEGORY_PALETTE, getCategoryPalette } from "./category-palette";

test("categoryPaletteIndex is stable for the same name", () => {
  assert.equal(categoryPaletteIndex("Nails"), categoryPaletteIndex("Nails"));
});

test("categoryPaletteIndex stays in range", () => {
  for (const s of ["", "a", "Nails & spa", "카테고리", "x".repeat(100)]) {
    const i = categoryPaletteIndex(s || " ");
    assert.ok(i >= 0 && i < CATEGORY_PALETTE.length);
  }
});

test("getCategoryPalette uses neutral styling for empty category", () => {
  const z = getCategoryPalette("");
  assert.ok(z.shell.includes("warm-cream"));
});

test("getCategoryPalette returns accentBar", () => {
  assert.match(getCategoryPalette("Test").accentBar, /^border-l-/);
});

test("getCategoryPalette assigns distinct shells by list order", () => {
  const cats = ["Loc extension", "Loc Maintenance", "Repairs"];
  const a = getCategoryPalette(cats[0], cats).shell;
  const b = getCategoryPalette(cats[1], cats).shell;
  const c = getCategoryPalette(cats[2], cats).shell;
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.notEqual(a, c);
});

test("getCategoryPalette is stable without orderedCategories", () => {
  assert.deepEqual(getCategoryPalette("Foo"), getCategoryPalette("Foo"));
});
