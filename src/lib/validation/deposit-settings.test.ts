import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDepositSettings } from "./deposit-settings";

test("required=false → ok with all fields cleared", () => {
  const r = validateDepositSettings({ deposit_required: false });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.deposit_required, false);
    assert.equal(r.value.deposit_mode, null);
    assert.equal(r.value.deposit_value, null);
    assert.equal(r.value.deposit_cashapp, null);
    assert.equal(r.value.deposit_zelle, null);
    assert.equal(r.value.deposit_other_label, null);
    assert.equal(r.value.deposit_other_value, null);
  }
});

test("required=true accepts fixed config with cashapp only", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_cashapp: "letstrylocs",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.deposit_cashapp, "letstrylocs");
    assert.equal(r.value.deposit_zelle, null);
  }
});

test("strips leading $ from cashapp", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_cashapp: "$mariam",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.deposit_cashapp, "mariam");
});

test("rejects invalid cashtag (non-alphanumeric)", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_cashapp: "bad handle!",
  });
  assert.equal(r.ok, false);
});

test("accepts zelle-only config", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 20,
    deposit_zelle: "(555) 123-4567",
  });
  assert.equal(r.ok, true);
});

test("accepts other-only config when label and value both set", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 25,
    deposit_other_label: "Venmo",
    deposit_other_value: "@mariam-pro",
  });
  assert.equal(r.ok, true);
});

test("rejects partial Other (label without value)", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 25,
    deposit_other_label: "Venmo",
    deposit_other_value: "",
  });
  assert.equal(r.ok, false);
});

test("rejects when no payment method is provided", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
  });
  assert.equal(r.ok, false);
});

test("rejects missing mode", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_value: 40,
    deposit_cashapp: "x",
  });
  assert.equal(r.ok, false);
});

test("rejects missing value", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_cashapp: "x",
  });
  assert.equal(r.ok, false);
});

test("fixed mode rejects 0 / negative value", () => {
  for (const value of [0, -10]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "fixed",
      deposit_value: value,
      deposit_cashapp: "x",
    });
    assert.equal(r.ok, false, `value=${value} should fail`);
  }
});

test("percent mode rejects out-of-range values", () => {
  for (const value of [0, 101, -5]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "percent",
      deposit_value: value,
      deposit_cashapp: "x",
    });
    assert.equal(r.ok, false, `percent=${value} should fail`);
  }
});

test("percent mode rejects non-integer values", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 12.5,
    deposit_cashapp: "x",
  });
  assert.equal(r.ok, false);
});
