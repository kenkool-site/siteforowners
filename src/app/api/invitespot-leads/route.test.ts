import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

const ENDPOINT = "http://localhost:3000/api/invitespot-leads";

function request(body: unknown): NextRequest {
  return new NextRequest(new URL(ENDPOINT), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("rejects malformed JSON with 400", async () => {
  const { POST } = await import("./route");
  const req = new NextRequest(new URL(ENDPOINT), { method: "POST", body: "not json" });
  const response = await POST(req);
  assert.equal(response.status, 400);
});

// A syntactically valid body that fails parseInvitespotLead's own rules
// (both contact fields blank) must 400 before any rate-limit/DB call —
// confirmed by the response body carrying parseInvitespotLead's own error text.
test("rejects a body with no email or phone with 400 and the validation error", async () => {
  const { POST } = await import("./route");
  const response = await POST(request({ name: "Chidinma O.", email: "", phone: "", eventType: "birthday" }));
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /email or phone/i);
});
