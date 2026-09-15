import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSubdomain,
  normalizePlatformSubdomain,
  pickAvailableSubdomain,
  validatePlatformSubdomain,
} from "./subdomain";

test("platform subdomains normalize human names into a DNS-safe label", () => {
  assert.equal(normalizePlatformSubdomain("  Mercy & John  "), "mercy-john");
  assert.equal(normalizePlatformSubdomain("A---B"), "a-b");
  assert.equal(normalizePlatformSubdomain("x".repeat(60)).length, 40);
});

test("platform subdomain validation distinguishes missing, invalid, and reserved labels", () => {
  assert.deepEqual(validatePlatformSubdomain("  "), { ok: false, error: "required" });
  assert.deepEqual(validatePlatformSubdomain("💐"), { ok: false, error: "invalid" });
  assert.deepEqual(validatePlatformSubdomain("WWW"), { ok: false, error: "reserved" });
  assert.deepEqual(validatePlatformSubdomain("Mercy & John"), { ok: true, value: "mercy-john" });
});

test("every protected platform hostname is reserved", () => {
  for (const label of [
    "www", "api", "admin", "app", "mail", "support", "help", "status",
    "static", "assets", "cdn", "dashboard", "invitations", "invite", "login", "preview",
  ]) {
    assert.deepEqual(validatePlatformSubdomain(label), { ok: false, error: "reserved" });
  }
});

test("generateSubdomain lowercases and dashes non-alphanumerics", () => {
  assert.equal(generateSubdomain("Let's Try Locs!"), "let-s-try-locs");
});

test("generateSubdomain trims leading/trailing dashes and caps at 40 chars", () => {
  assert.equal(generateSubdomain("  --Hello--  "), "hello");
  assert.equal(generateSubdomain("x".repeat(60)).length, 40);
});

test("pickAvailableSubdomain returns base when free", () => {
  assert.equal(pickAvailableSubdomain("letstrylocs", () => false), "letstrylocs");
});

test("pickAvailableSubdomain appends incrementing suffix when taken", () => {
  const taken = new Set(["letstrylocs", "letstrylocs-2"]);
  assert.equal(pickAvailableSubdomain("letstrylocs", (c) => taken.has(c)), "letstrylocs-3");
});

test("pickAvailableSubdomain falls back to 'site' for empty base", () => {
  assert.equal(pickAvailableSubdomain("", () => false), "site");
});

test("pickAvailableSubdomain stays distinct and ≤40 chars for a 40-char taken base (no infinite loop)", () => {
  const root = "a".repeat(40);
  const taken = new Set([root]);
  const result = pickAvailableSubdomain(root, (c) => taken.has(c));
  assert.notEqual(result, root);
  assert.ok(result.length <= 40, `length ${result.length} should be <= 40`);
  assert.ok(!taken.has(result));
});
