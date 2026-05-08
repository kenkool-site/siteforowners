import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServiceItem } from "@/lib/ai/types";
import { groupServices } from "./groupServices";

const s = (name: string, category?: string): ServiceItem => ({ name, price: "$50", category });

test("groupServices: no categories → single null group", () => {
  const out = groupServices([s("a"), s("b")], undefined);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, null);
  assert.equal(out[0].services.length, 2);
});

test("groupServices: empty categories array → flat group", () => {
  const out = groupServices([s("a")], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, null);
});

test("groupServices: categorized services land in their group", () => {
  const out = groupServices(
    [s("a", "Braids"), s("b", "Touch ups"), s("c", "Braids")],
    ["Braids", "Touch ups"],
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Braids");
  assert.equal(out[0].services.length, 2);
  assert.equal(out[1].label, "Touch ups");
  assert.equal(out[1].services.length, 1);
});

test("groupServices: uncategorized services land in Other", () => {
  const out = groupServices([s("a", "Braids"), s("b")], ["Braids"]);
  assert.equal(out.length, 2);
  assert.equal(out[1].label, "Other");
  assert.equal(out[1].services.length, 1);
});

test("groupServices: stale category reference falls into Other", () => {
  const out = groupServices(
    [s("a", "Old"), s("b", "Braids")],
    ["Braids"],
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Braids");
  assert.equal(out[1].label, "Other");
  assert.equal(out[1].services[0].name, "a");
});

test("groupServices: empty categories produce no group entry", () => {
  const out = groupServices([s("a", "Braids")], ["Braids", "Touch ups"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Braids");
});

test("groupServices: preserves category order", () => {
  const out = groupServices(
    [s("c", "C"), s("a", "A"), s("b", "B")],
    ["A", "B", "C"],
  );
  assert.deepEqual(out.map((g) => g.label), ["A", "B", "C"]);
});

test("groupServices: Other group is last", () => {
  const out = groupServices([s("a"), s("b", "Braids")], ["Braids"]);
  assert.deepEqual(out.map((g) => g.label), ["Braids", "Other"]);
});

test("groupServices: featured services land in a Featured group at the top", () => {
  const out = groupServices(
    [
      { name: "trim", price: "$20", category: "Cuts", is_featured: true },
      { name: "color", price: "$80", category: "Color" },
      { name: "extensions", price: "$200", category: "Cuts" },
    ],
    ["Cuts", "Color"],
  );
  assert.deepEqual(out.map((g) => g.label), ["Featured", "Cuts", "Color"]);
  assert.equal(out[0].services.length, 1);
  assert.equal(out[0].services[0].name, "trim");
  // Trim must NOT also appear in Cuts
  assert.equal(out[1].services.length, 1);
  assert.equal(out[1].services[0].name, "extensions");
});

test("groupServices: Featured preserves order across categories", () => {
  const out = groupServices(
    [
      { name: "a", price: "$1", category: "X", is_featured: true },
      { name: "b", price: "$2", category: "Y" },
      { name: "c", price: "$3", category: "X", is_featured: true },
    ],
    ["X", "Y"],
  );
  assert.deepEqual(out[0].services.map((s) => s.name), ["a", "c"]);
});

test("groupServices: featured uncategorized service still appears in Featured (not Other)", () => {
  const out = groupServices(
    [
      { name: "a", price: "$1", is_featured: true },
      { name: "b", price: "$2" },
    ],
    ["X"],
  );
  assert.deepEqual(out.map((g) => g.label), ["Featured", "Other"]);
  assert.equal(out[0].services[0].name, "a");
  assert.equal(out[1].services[0].name, "b");
});

test("groupServices: featured works with no categories defined", () => {
  const out = groupServices(
    [
      { name: "a", price: "$1", is_featured: true },
      { name: "b", price: "$2" },
    ],
    undefined,
  );
  assert.deepEqual(out.map((g) => g.label), ["Featured", null]);
});
