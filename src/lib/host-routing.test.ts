import assert from "node:assert/strict";
import test from "node:test";
import { classifyHost, invitationRewritePath } from "./host-routing";

test("host classification recognizes root, preview, platform, local, and custom hosts", () => {
  assert.deepEqual(classifyHost("www.siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("feature-abc.vercel.app"), { kind: "root" });
  assert.deepEqual(classifyHost("mercy-john.siteforowners.com"), { kind: "platform", label: "mercy-john", apex: "siteforowners" });
  assert.deepEqual(classifyHost("mercy-john.localhost:3000"), { kind: "platform", label: "mercy-john", apex: "local" });
  assert.deepEqual(classifyHost("events.example.com"), { kind: "custom", hostname: "events.example.com" });
});

test("invitespot.app subdomains classify as platform with apex invitespot", () => {
  assert.deepEqual(classifyHost("mercy-john.invitespot.app"), { kind: "platform", label: "mercy-john", apex: "invitespot" });
});

test("the bare invitespot.app apex (with or without www) classifies distinctly from the shared siteforowners.com root", () => {
  assert.deepEqual(classifyHost("invitespot.app"), { kind: "invitespot-root" });
  assert.deepEqual(classifyHost("www.invitespot.app"), { kind: "invitespot-root" });
});

test("invitation hosts expose the root public entry point and the memories page", () => {
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/"), "/invite/mercy-john-lx9cwn");
  assert.equal(invitationRewritePath("mercy/john", "/"), "/invite/mercy%2Fjohn");
  assert.equal(invitationRewritePath("mercy-john", "/memories"), "/invite/mercy-john/memories");
  assert.equal(invitationRewritePath("mercy/john", "/memories"), "/invite/mercy%2Fjohn/memories");
  assert.equal(invitationRewritePath("mercy-john", "/details"), null);
});

// The passcode gate's own internal redirect (src/app/invite/[slug]/memories/page.tsx)
// targets `/invite/{slug}` and `/invite/{slug}/memories` on the same host it was
// reached on. Without an identity passthrough for those exact paths, a platform
// subdomain 404s on that redirect instead of reaching the passcode gate.
test("invitation hosts pass through the already-resolved /invite/{slug} paths unchanged, for the passcode gate's own internal redirect", () => {
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/invite/mercy-john-lx9cwn"), "/invite/mercy-john-lx9cwn");
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/invite/mercy-john-lx9cwn/memories"), "/invite/mercy-john-lx9cwn/memories");
  assert.equal(invitationRewritePath("mercy/john", "/invite/mercy%2Fjohn"), "/invite/mercy%2Fjohn");
  assert.equal(invitationRewritePath("mercy/john", "/invite/mercy%2Fjohn/memories"), "/invite/mercy%2Fjohn/memories");
});

test("invitation hosts still 404 an unrelated slug's already-resolved invite path", () => {
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/invite/someone-else"), null);
});
