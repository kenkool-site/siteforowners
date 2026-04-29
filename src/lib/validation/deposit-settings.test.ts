import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDepositSettings } from "./deposit-settings";

test("validateDepositSettings: required=false → ok with cleared fields", () => {
  const r = validateDepositSettings({ deposit_required: false });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.deposit_required, false);
    assert.equal(r.value.deposit_mode, null);
    assert.equal(r.value.deposit_value, null);
    assert.equal(r.value.deposit_instructions, null);
  }
});

test("validateDepositSettings: required=true with full fixed config", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, true);
});

test("validateDepositSettings: required=true with full percent config", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 20,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, true);
});

test("validateDepositSettings: required=true rejects missing mode", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_value: 40,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: required=true rejects missing value", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: required=true rejects missing instructions", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: fixed mode rejects 0 / negative value", () => {
  for (const value of [0, -10]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "fixed",
      deposit_value: value,
      deposit_instructions: "Cash App: $x",
    });
    assert.equal(r.ok, false, `value=${value} should fail`);
  }
});

test("validateDepositSettings: percent mode rejects out-of-range values", () => {
  for (const value of [0, 101, -5]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "percent",
      deposit_value: value,
      deposit_instructions: "Cash App: $x",
    });
    assert.equal(r.ok, false, `percent=${value} should fail`);
  }
});

test("validateDepositSettings: percent mode rejects non-integer values", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 12.5,
    deposit_instructions: "Cash App: $x",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: instructions silently truncated to 1000 chars", () => {
  const long = "x".repeat(1500);
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_instructions: long,
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.deposit_instructions!.length, 1000);
});
