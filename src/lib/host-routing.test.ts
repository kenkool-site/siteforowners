import assert from "node:assert/strict";
import test from "node:test";
import { classifyHost, invitationRewritePath } from "./host-routing";

test("host classification recognizes root, preview, platform, local, and custom hosts", () => {
  assert.deepEqual(classifyHost("www.siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("feature-abc.vercel.app"), { kind: "root" });
  assert.deepEqual(classifyHost("mercy-john.siteforowners.com"), { kind: "platform", label: "mercy-john" });
  assert.deepEqual(classifyHost("mercy-john.localhost:3000"), { kind: "platform", label: "mercy-john" });
  assert.deepEqual(classifyHost("events.example.com"), { kind: "custom", hostname: "events.example.com" });
});

test("invitation hosts expose only the root public entry point", () => {
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/"), "/invite/mercy-john-lx9cwn");
  assert.equal(invitationRewritePath("mercy/john", "/"), "/invite/mercy%2Fjohn");
  assert.equal(invitationRewritePath("mercy-john", "/details"), null);
});
