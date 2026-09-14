import assert from "node:assert/strict";
import test from "node:test";
import { signOwnerSession, verifyOwnerSession } from "./auth";

test("owner sessions reject tampering and expiry", () => {
  const token = signOwnerSession(
    { ownerId: "11111111-1111-4111-8111-111111111111", expiresAt: 2_000 },
    "x".repeat(32),
  );
  assert.equal(
    verifyOwnerSession(token, "x".repeat(32), 1_999)?.ownerId,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(verifyOwnerSession(`${token}x`, "x".repeat(32), 1_999), null);
  assert.equal(verifyOwnerSession(token, "x".repeat(32), 2_001), null);
});
