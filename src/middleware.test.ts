import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

test("root-domain invitation admin routes require the founder session", async () => {
  const originalPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "founder-secret";
  try {
    const request = new NextRequest("http://localhost/admin/invitations", {
      headers: { host: "localhost" },
    });
    const response = await middleware(request);

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost/login");
  } finally {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  }
});
