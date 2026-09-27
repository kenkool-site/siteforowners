import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

const ENDPOINT = "http://localhost:3000/api/admin/invitespot-leads";

test("rejects an unauthenticated request with 401", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(ENDPOINT), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: "11111111-1111-1111-1111-111111111111", status: "contacted" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

test("rejects a malformed leadId with 400, past the auth check", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(ENDPOINT), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "admin_session=test-admin-password" },
      body: JSON.stringify({ leadId: "not-a-uuid", status: "contacted" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

test("rejects an invalid status, past the leadId check", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(ENDPOINT), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "admin_session=test-admin-password" },
      body: JSON.stringify({ leadId: "11111111-1111-1111-1111-111111111111", status: "banana" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

// Structural, matching this codebase's convention for founder-admin routes
// (see src/app/api/invitations/admin/find-me-settings/route.test.ts): the
// success and error responses here depend on a real Supabase `.update()`
// call this test environment has no live connection for, so this asserts
// the write targets the right table/column and that both response branches
// are shaped correctly, rather than mocking createAdminClient or invoking
// a live handler for these two branches.
test("on a valid authenticated request, updates only invitespot_leads.status for the given id and returns 200 on success / 500 on a Supabase error", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  const updateIndex = source.indexOf(".update(");
  const errorCheckIndex = source.indexOf("if (error)");
  const okReturnIndex = source.indexOf("NextResponse.json({ ok: true })");
  assert.notEqual(updateIndex, -1);
  assert.notEqual(errorCheckIndex, -1);
  assert.notEqual(okReturnIndex, -1);

  // The write touches invitespot_leads.status filtered by id, not
  // marketing_leads or some other field.
  const updateCallSource = source.slice(updateIndex - 40, updateIndex + 80);
  assert.match(updateCallSource, /\.from\("invitespot_leads"\)/);
  assert.match(updateCallSource, /\.update\(\{\s*status\s*\}\)/);
  assert.match(updateCallSource, /\.eq\("id",\s*leadId\)/);

  // The error branch checks `if (error)` and returns 500.
  const errorBranchSource = source.slice(errorCheckIndex, okReturnIndex);
  assert.match(errorBranchSource, /if \(error\)/);
  assert.match(errorBranchSource, /NextResponse\.json\(\{ error: .* \}, \{ status: 500 \}\)/);

  // The success return sits after the error-handling block, i.e. it is only
  // reached when `.update()` did not return an error.
  assert.ok(errorCheckIndex < okReturnIndex);
});
