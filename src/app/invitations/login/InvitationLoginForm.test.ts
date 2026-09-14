import assert from "node:assert/strict";
import test from "node:test";
import { loginErrorMessageKey } from "./InvitationLoginForm";

test("login errors distinguish invalid credentials, rate limits, and server failures", () => {
  assert.equal(loginErrorMessageKey(401), "invalidCredentials");
  assert.equal(loginErrorMessageKey(429), "rateLimited");
  assert.equal(loginErrorMessageKey(500), "genericError");
});
