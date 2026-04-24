import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin, signSession, verifySession } from "./admin-auth";

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

// Set a stable secret for tests
process.env.SESSION_COOKIE_SECRET = "a".repeat(64);

test("signSession: round-trips tenant_id and exp", () => {
  const future = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const signed = signSession({ tenant_id: "abc-123", exp: future });
  const result = verifySession(signed);
  assert.equal(result?.tenant_id, "abc-123");
  assert.equal(result?.exp, future);
});

test("verifySession: returns null for tampered payload", () => {
  const signed = signSession({ tenant_id: "abc-123", exp: 9999999999 });
  // Flip one character in the payload section
  const [payload, sig] = signed.split(".");
  const tampered = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A") + "." + sig;
  assert.equal(verifySession(tampered), null);
});

test("verifySession: returns null for bad signature", () => {
  const signed = signSession({ tenant_id: "abc-123", exp: 9999999999 });
  const [payload] = signed.split(".");
  assert.equal(verifySession(payload + ".0000"), null);
});

test("verifySession: returns null for expired session", () => {
  const past = Math.floor(Date.now() / 1000) - 10;
  const signed = signSession({ tenant_id: "abc-123", exp: past });
  assert.equal(verifySession(signed), null);
});

test("verifySession: returns null for malformed input", () => {
  assert.equal(verifySession(""), null);
  assert.equal(verifySession("no-dot"), null);
  assert.equal(verifySession("a.b.c"), null);
});
