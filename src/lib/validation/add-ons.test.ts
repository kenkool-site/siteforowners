import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAddOns } from "./add-ons";

test("validateAddOns: accepts undefined", () => {
  const r = validateAddOns(undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateAddOns: accepts empty array", () => {
  const r = validateAddOns([]);
  assert.equal(r.ok, true);
});

test("validateAddOns: accepts well-formed add-on", () => {
  const r = validateAddOns([
    { name: "Hair Wash", price_delta: 25, duration_delta_minutes: 30 },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value[0].name, "Hair Wash");
    assert.equal(r.value[0].price_delta, 25);
    assert.equal(r.value[0].duration_delta_minutes, 30);
  }
});

test("validateAddOns: truncates name to 80 chars", () => {
  const long = "x".repeat(150);
  const r = validateAddOns([
    { name: long, price_delta: 0, duration_delta_minutes: 0 },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value[0].name.length, 80);
});

test("validateAddOns: rejects negative price_delta", () => {
  const r = validateAddOns([
    { name: "x", price_delta: -1, duration_delta_minutes: 30 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects non-multiple-of-30 duration", () => {
  const r = validateAddOns([
    { name: "x", price_delta: 0, duration_delta_minutes: 45 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects negative duration", () => {
  const r = validateAddOns([
    { name: "x", price_delta: 0, duration_delta_minutes: -30 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: truncates to 10 entries silently", () => {
  const eleven = Array(11).fill(0).map((_, i) => ({
    name: `a${i}`,
    price_delta: 0,
    duration_delta_minutes: 0,
  }));
  const r = validateAddOns(eleven);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.length, 10);
});

test("validateAddOns: rejects empty name after trim", () => {
  const r = validateAddOns([
    { name: "  ", price_delta: 0, duration_delta_minutes: 0 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects non-array input", () => {
  const r = validateAddOns("nope");
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects duplicate names (case-insensitive after trim)", () => {
  const r = validateAddOns([
    { name: "Hair Wash", price_delta: 0, duration_delta_minutes: 30 },
    { name: "  hair wash  ", price_delta: 0, duration_delta_minutes: 60 },
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors[0].reason, /duplicate/i);
});
