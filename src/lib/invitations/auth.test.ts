import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import {
  INVITATION_OWNER_SESSION_COOKIE,
  clearOwnerSessionCookie,
  createEditToken,
  isSameOrigin,
  setOwnerSessionCookie,
  signOwnerSession,
  verifyEditToken,
  verifyOwnerSession,
} from "./auth";

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

test("edit tokens verify only against their stored hash", () => {
  const { token, hash } = createEditToken();
  assert.equal(verifyEditToken(token, hash), true);
  assert.equal(verifyEditToken(`${token}x`, hash), false);
});

test("owner sessions use a dedicated HTTP-only cookie", () => {
  const originalSecret = process.env.SESSION_COOKIE_SECRET;
  process.env.SESSION_COOKIE_SECRET = "x".repeat(32);
  try {
    const response = NextResponse.json({ ok: true });
    setOwnerSessionCookie(response, "owner-1");
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`${INVITATION_OWNER_SESSION_COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /SameSite=lax/i);
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_COOKIE_SECRET;
    else process.env.SESSION_COOKIE_SECRET = originalSecret;
  }
});

test("logout clears only the dedicated owner session cookie", () => {
  const response = NextResponse.json({ ok: true });
  clearOwnerSessionCookie(response);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`${INVITATION_OWNER_SESSION_COOKIE}=;`));
  assert.match(cookie, /Max-Age=0/);
  assert.doesNotMatch(cookie, /(?:^|;\s*)owner_session=/);
});

test("same-origin checks require an exact forwarded scheme and host", () => {
  const matching = new NextRequest("https://app.example.test/api/invitations/auth/logout", {
    method: "POST",
    headers: {
      origin: "https://app.example.test",
      "x-forwarded-host": "app.example.test",
      "x-forwarded-proto": "https",
    },
  });
  const differentScheme = new NextRequest("https://app.example.test/api/invitations/auth/logout", {
    method: "POST",
    headers: {
      origin: "http://app.example.test",
      "x-forwarded-host": "app.example.test",
      "x-forwarded-proto": "https",
    },
  });
  const missingOrigin = new NextRequest("https://app.example.test/api/invitations/auth/logout", {
    method: "POST",
    headers: { "x-forwarded-host": "app.example.test", "x-forwarded-proto": "https" },
  });

  assert.equal(isSameOrigin(matching), true);
  assert.equal(isSameOrigin(differentScheme), false);
  assert.equal(isSameOrigin(missingOrigin), false);
});
