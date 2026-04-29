import { test } from "node:test";
import assert from "node:assert/strict";

const SECRET = "test-secret-do-not-use-in-prod";
process.env.RESCHEDULE_TOKEN_SECRET = SECRET;

import { signToken, verifyToken, buildRescheduleUrl } from "./reschedule-token";

test("signToken + verifyToken round-trip succeeds", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry, signature: sig });
  assert.equal(r.ok, true);
});

test("verifyToken rejects expired token", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) - 60;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry, signature: sig });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "expired");
});

test("verifyToken rejects tampered signature", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const tampered = sig.slice(0, -2) + "XX";
  const r = verifyToken({ bookingId, expiry, signature: tampered });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("verifyToken rejects tampered bookingId", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({
    bookingId: "00000000-0000-0000-0000-000000000002",
    expiry,
    signature: sig,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("verifyToken rejects tampered expiry", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry: expiry + 100, signature: sig });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("buildRescheduleUrl produces /reschedule?b=&e=&s= shape", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const url = buildRescheduleUrl("https://example.com", bookingId, expiry);
  const u = new URL(url);
  assert.equal(u.pathname, "/reschedule");
  assert.equal(u.searchParams.get("b"), bookingId);
  assert.equal(u.searchParams.get("e"), String(expiry));
  assert.ok(u.searchParams.get("s")?.length, "signature present");
});

test("signToken throws when RESCHEDULE_TOKEN_SECRET is missing", () => {
  const before = process.env.RESCHEDULE_TOKEN_SECRET;
  delete process.env.RESCHEDULE_TOKEN_SECRET;
  assert.throws(() => signToken({ bookingId: "x", expiry: 1 }), /RESCHEDULE_TOKEN_SECRET/);
  process.env.RESCHEDULE_TOKEN_SECRET = before;
});
