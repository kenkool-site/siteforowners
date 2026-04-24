import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin } from "./admin-auth";

test("hashPin: returns salt:hash format", async () => {
  const hashed = await hashPin("123456");
  const parts = hashed.split(":");
  assert.equal(parts.length, 2);
  assert.equal(parts[0].length, 32); // 16 bytes hex
  assert.equal(parts[1].length, 128); // 64 bytes hex
});

test("hashPin: produces different output for same input (random salt)", async () => {
  const a = await hashPin("123456");
  const b = await hashPin("123456");
  assert.notEqual(a, b);
});

test("verifyPin: accepts correct PIN", async () => {
  const hashed = await hashPin("123456");
  assert.equal(await verifyPin("123456", hashed), true);
});

test("verifyPin: rejects wrong PIN", async () => {
  const hashed = await hashPin("123456");
  assert.equal(await verifyPin("654321", hashed), false);
});

test("verifyPin: rejects when hash is malformed", async () => {
  assert.equal(await verifyPin("123456", "not-a-real-hash"), false);
  assert.equal(await verifyPin("123456", ""), false);
});

test("verifyPin: constant-time (does not throw) on mismatched lengths", async () => {
  const hashed = await hashPin("123456");
  assert.equal(await verifyPin("", hashed), false);
  assert.equal(await verifyPin("1234567", hashed), false);
});
