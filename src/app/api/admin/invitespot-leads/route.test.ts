import assert from "node:assert/strict";
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
