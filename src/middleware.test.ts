import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

test("root-domain invitation admin routes require the founder session", async () => {
  const originalPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "founder-secret";
  try {
    const request = new NextRequest("http://localhost/admin/invitations", {
      headers: { host: "localhost", cookie: "admin_session=wrong-secret" },
    });
    const response = await middleware(request);

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost/login");
  } finally {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  }
});

test("root-domain invitation admin routes fail closed when the founder secret is missing", async () => {
  const originalPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    const request = new NextRequest("http://localhost/admin/invitations", {
      headers: { host: "localhost", cookie: "admin_session=any-cookie" },
    });
    const response = await middleware(request);

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost/login");
  } finally {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  }
});

import { readFileSync } from "node:fs";

// The reservation lookup these branches depend on needs Supabase, which has
// no credentials in this tsx --test environment (same limitation as every
// other Supabase-dependent route tested in this codebase) — so, matching
// that established convention, these are structural source-based tests
// rather than live invocations.

test("middleware redirects a siteforowners.com invitation-event host to its invitespot.app equivalent with a permanent 301, before any invitation_events lookup", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /if \(host\.apex === "siteforowners"\)/);
  assert.match(source, /`https:\/\/\$\{host\.label\}\.invitespot\.app`/);
  assert.match(source, /NextResponse\.redirect\(redirectUrl, 301\)/);
  const redirectIndex = source.indexOf('if (host.apex === "siteforowners")');
  const eventLookupIndex = source.indexOf('.from("invitation_events")');
  assert.ok(redirectIndex > -1 && eventLookupIndex > -1 && redirectIndex < eventLookupIndex);
});

test("middleware preserves the request's query string on the invitespot.app redirect", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /redirectUrl\.search = request\.nextUrl\.search/);
});

test("middleware returns a not-found, no-store response for a tenant label requested under invitespot.app, without querying the tenants table for it", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /if \(host\.apex === "invitespot"\)/);
  const guardIndex = source.indexOf('if (host.apex === "invitespot")');
  const tenantLookupIndex = source.indexOf('.eq("id", reservation.tenant_id)');
  assert.ok(guardIndex > -1 && tenantLookupIndex > -1 && guardIndex < tenantLookupIndex);
});

test("middleware rewrites the invitespot.app apex to its dedicated route, before any Supabase client is created", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /host\.kind === "invitespot-root"/);
  const invitespotRootIndex = source.indexOf('host.kind === "invitespot-root"');
  const supabaseClientIndex = source.indexOf("createClient(supabaseUrl, supabaseKey)");
  assert.ok(invitespotRootIndex > -1 && supabaseClientIndex > -1 && invitespotRootIndex < supabaseClientIndex);
});

// Behavioral, not structural: a source-regex match on the rewrite
// expression is exactly how this branch previously shipped (and pinned as
// "correct") a bug that silently dropped the entire query string —
// stripping ?from={slug}, the invitation footer's referral link, before
// the page ever saw it. This calls middleware() directly (no Supabase
// client is constructed on this path, confirmed by the ordering test
// above), so it can assert on the real rewrite target instead of the
// literal source text.
test("middleware preserves the query string (?from and ?lang) when rewriting the invitespot.app apex to /invitespot, and marks it no-store", async () => {
  const request = new NextRequest("https://invitespot.app/?from=mia-and-lee&lang=es", {
    headers: { host: "invitespot.app" },
  });
  const response = await middleware(request);
  const rewriteTarget = response.headers.get("x-middleware-rewrite");
  assert.ok(rewriteTarget, "expected a rewrite response");
  const url = new URL(rewriteTarget!);
  assert.equal(url.pathname, "/invitespot");
  assert.equal(url.searchParams.get("from"), "mia-and-lee");
  assert.equal(url.searchParams.get("lang"), "es");
  assert.equal(response.headers.get("Cache-Control"), "no-store, must-revalidate");
});

// The invitespot-root branch used to be an unconditional rewrite to /invitespot
// regardless of pathname, which swallowed /invite/{slug} — the exact path
// invitationPublicUrl's no-subdomain fallback now points at for
// www.invitespot.app (an "invitespot-root" host, not "platform"). These tests
// pin the pathname-aware replacement: only "/" goes to the placeholder,
// "/invite/*" passes through untouched, and everything else explicitly
// 404s (deny-by-default, so /clients, /prospects, etc. never leak onto the
// invitespot.app brand).
test("the invitespot-root branch only rewrites the bare '/' path to the placeholder", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const rootBlock = source.slice(
    source.indexOf('host.kind === "invitespot-root"'),
    source.indexOf('const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;'),
  );
  assert.match(rootBlock, /if \(pathname === "\/"\)/);
  assert.match(rootBlock, /NextResponse\.rewrite\(invitespotUrl\)/);
});

test("the invitespot-root branch lets /invite/* paths through with NextResponse.next()", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const rootBlock = source.slice(
    source.indexOf('host.kind === "invitespot-root"'),
    source.indexOf('const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;'),
  );
  assert.match(rootBlock, /if \(pathname\.startsWith\("\/invite\/"\)\) return NextResponse\.next\(\);/);
});

test("the invitespot-root branch denies everything else with a no-store 404, not a bare next()", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const rootBlock = source.slice(
    source.indexOf('host.kind === "invitespot-root"'),
    source.indexOf('const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;'),
  );
  assert.match(rootBlock, /NextResponse\.rewrite\(new URL\("\/not-found", request\.url\)\)/);
  assert.match(rootBlock, /no-store, must-revalidate/);
});
