import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

function call(cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", `admin_session=${cookie}`);
  return POST(new NextRequest("http://localhost/api/publish-site", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenant_id: "00000000-0000-0000-0000-000000000000" }),
  }));
}

test("publish-site rejects unauthenticated writes before touching tenant data", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "founder-secret";
  try {
    const missing = await call();
    const wrong = await call("not-the-password");
    for (const response of [missing, wrong]) {
      assert.equal(response.status, 401);
      const body = await response.json() as { error?: string };
      assert.equal(body.error, "Unauthorized");
      assert.equal(JSON.stringify(body).includes("phone"), false);
    }
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

test("publish-site fails closed when the founder secret is missing", async () => {
  const original = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    const response = await call("anything");
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});
