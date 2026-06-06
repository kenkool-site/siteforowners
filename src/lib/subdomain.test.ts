import test from "node:test";
import assert from "node:assert/strict";
import { generateSubdomain, pickAvailableSubdomain } from "./subdomain";

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
