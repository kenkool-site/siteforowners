import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomDomainForStorage } from "./normalize-custom-domain";

test("parseCustomDomainForStorage clears empty and strips www and URL noise", () => {
  assert.deepEqual(parseCustomDomainForStorage(""), { ok: true, value: null });
  assert.deepEqual(parseCustomDomainForStorage("  "), { ok: true, value: null });
  assert.deepEqual(parseCustomDomainForStorage(null), { ok: true, value: null });
  assert.deepEqual(parseCustomDomainForStorage("https://www.Example.com/path"), {
    ok: true,
    value: "example.com",
  });
});

test("parseCustomDomainForStorage rejects siteforowners hostnames", () => {
  const r = parseCustomDomainForStorage("foo.siteforowners.com");
  assert.equal(r.ok, false);
});
