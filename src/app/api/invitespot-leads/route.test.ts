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

// checkRateLimit (src/lib/api-rate-limit.ts) runs before the route ever
// parses the request body, and it constructs a Supabase admin client
// synchronously outside any try/catch — so with no Supabase env vars at all,
// client construction throws immediately ("supabaseUrl is required.") rather
// than reaching the .rpc() call whose error path is what actually implements
// checkRateLimit's documented fail-open behavior. Setting syntactically-valid
// (but fake) credentials lets construction succeed so the failure happens at
// the network-call level instead, which IS caught and fails open as intended.
// This mirrors the save/restore-env-var pattern used elsewhere in this
// codebase (see generate-route.test.ts's founderRequest() helper, which sets
// process.env.ADMIN_PASSWORD around a request).
test("rejects malformed JSON with 400", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
  try {
    const { POST } = await import("./route");
    const req = new NextRequest(new URL(ENDPOINT), { method: "POST", body: "not json" });
    const response = await POST(req);
    assert.equal(response.status, 400);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

// A syntactically valid body that fails parseInvitespotLead's own rules
// (both contact fields blank) must 400 before any rate-limit/DB call —
// confirmed by the response body carrying parseInvitespotLead's own error text.
// Same dummy-credential need as above — see the comment on the previous test.
test("rejects a body with no email or phone with 400 and the validation error", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
  try {
    const { POST } = await import("./route");
    const response = await POST(request({ name: "Chidinma O.", email: "", phone: "", eventType: "birthday" }));
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.error, /email or phone/i);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
