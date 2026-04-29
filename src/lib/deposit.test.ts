import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServicePrice, computeDeposit } from "./deposit";

test("parseServicePrice: '$250' → 250", () => {
  assert.equal(parseServicePrice("$250"), 250);
});

test("parseServicePrice: '1,200' → 1200", () => {
  assert.equal(parseServicePrice("$1,200"), 1200);
});

test("parseServicePrice: 'From $50' → 50", () => {
  assert.equal(parseServicePrice("From $50"), 50);
});

test("parseServicePrice: 'Free' → 0", () => {
  assert.equal(parseServicePrice("Free"), 0);
});

test("parseServicePrice: empty / NaN → 0", () => {
  assert.equal(parseServicePrice(""), 0);
  assert.equal(parseServicePrice("call for quote"), 0);
});

test("computeDeposit: deposit_required=false → 0", () => {
  const d = computeDeposit(
    { deposit_required: false },
    250,
    0,
  );
  assert.equal(d, 0);
});

test("computeDeposit: fixed mode → flat amount", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "fixed", deposit_value: 40 },
    250,
    0,
  );
  assert.equal(d, 40);
});

test("computeDeposit: percent mode applies to base + add-ons", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 20 },
    250,
    50,
  );
  assert.equal(d, 60); // 20% of 300
});

test("computeDeposit: percent mode rounds to cents", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 33 },
    100,
    0,
  );
  assert.equal(d, 33); // 33% of 100 = 33.00
});

test("computeDeposit: percent mode with non-trivial rounding", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 15 },
    99.99,
    0,
  );
  assert.equal(d, 15); // 15% of 99.99 = 14.9985 → 15.00 rounded
});

test("computeDeposit: percent mode falls back to fixed when basePrice is 0", () => {
  // Service price was unparseable upstream → basePrice=0 + addOnTotal=0
  // means percent of 0 = 0, but the spec says fall back to treating
  // deposit_value as a flat dollar amount in this case.
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 40 },
    0,
    0,
  );
  assert.equal(d, 40);
});
