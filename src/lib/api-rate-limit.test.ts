import { test } from "node:test";
import assert from "node:assert/strict";
import { hashIp, getClientIp, trackBucket, loginTenantBucket } from "./api-rate-limit";

test("hashIp: same input → same hash", () => {
  process.env.IP_HASH_PEPPER = "test-pepper";
  assert.equal(hashIp("1.2.3.4"), hashIp("1.2.3.4"));
});

test("hashIp: different inputs → different hashes", () => {
  process.env.IP_HASH_PEPPER = "test-pepper";
  assert.notEqual(hashIp("1.2.3.4"), hashIp("1.2.3.5"));
});

test("hashIp: pepper changes hash", () => {
  process.env.IP_HASH_PEPPER = "pepper-a";
  const hashA = hashIp("1.2.3.4");
  process.env.IP_HASH_PEPPER = "pepper-b";
  const hashB = hashIp("1.2.3.4");
  assert.notEqual(hashA, hashB);
});

test("getClientIp: prefers x-forwarded-for first entry", () => {
  const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" });
  assert.equal(getClientIp(h), "1.2.3.4");
});

test("getClientIp: falls back to x-real-ip when no x-forwarded-for", () => {
  const h = new Headers({ "x-real-ip": "9.9.9.9" });
  assert.equal(getClientIp(h), "9.9.9.9");
});

test("getClientIp: returns 'unknown' when neither header is set", () => {
  const h = new Headers();
  assert.equal(getClientIp(h), "unknown");
});

test("getClientIp: trims whitespace from x-forwarded-for entry", () => {
  const h = new Headers({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
  assert.equal(getClientIp(h), "1.2.3.4");
});

test("trackBucket: composes deterministic key", () => {
  assert.equal(trackBucket("t-1", "h-1"), "track:t-1:h-1");
});

test("loginTenantBucket: composes deterministic key", () => {
  assert.equal(loginTenantBucket("t-1"), "login_tenant:t-1");
});
