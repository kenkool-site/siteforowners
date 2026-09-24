import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { MemoryHighlightGeneration } from "@/lib/invitations/memories/highlight-types";
import type { HighlightGenerationState } from "@/lib/invitations/memories/repository";

const EVENT_ID = "event-1";
const BASE_URL = `http://localhost:3000/api/invitations/events/${EVENT_ID}/memories/highlights/generate`;

function sameOriginHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...extra };
}

// See highlights-route.test.ts's own comment: only the founder/admin_session
// branch of requireInvitationAccess is DB-free, so it's the only way to
// genuinely exercise "past the auth guard" behavior without a real Supabase
// instance under tsx --test.
function founderRequest(): NextRequest {
  process.env.ADMIN_PASSWORD = "test-admin-password";
  return new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: { ...sameOriginHeaders(), cookie: "admin_session=test-admin-password" },
  });
}

test("generate route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("POST rejects a cross-origin request with 403", async () => {
  const { POST } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: { origin: "http://attacker.example", host: "localhost:3000" },
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("POST rejects an unauthenticated same-origin request with 401", async () => {
  const { POST } = await import("./route");
  delete process.env.ADMIN_PASSWORD;
  const request = new NextRequest(new URL(BASE_URL), { method: "POST", headers: sameOriginHeaders() });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("POST grants founder/admin access and reaches the generation decision (not a guard rejection)", async () => {
  const { POST } = await import("./route");
  const request = founderRequest();
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  // No real Supabase instance in this environment, so the real
  // requestHighlightGeneration call fails — that failure (500) is itself
  // proof the handler got past same-origin/auth and attempted the real work.
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});

// The actual duplicate-generation decision logic, unit-tested directly with
// injected fakes — see generate-request.ts's own header comment for why this
// codebase's tsx --test convention has no way to exercise it end-to-end
// through the route without a real Supabase instance.
test("resolveHighlightGenerationRequest: queues and returns 202 with the new generation when none is pending", async () => {
  const { resolveHighlightGenerationRequest } = await import("./generate-request");
  const generation: MemoryHighlightGeneration = {
    id: "gen-new",
    eventId: EVENT_ID,
    mode: "automatic",
    status: "queued",
    mediaCount: 0,
    errorCode: null,
    createdAt: "2026-09-24T00:00:00Z",
    publishedAt: null,
  };
  const result = await resolveHighlightGenerationRequest(EVENT_ID, {
    requestHighlightGeneration: async () => generation,
    getHighlightGenerationState: async () => {
      throw new Error("must not be called when a new generation was queued");
    },
  });
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { generation: { id: "gen-new", status: "queued", mediaCount: 0 } });
});

test("resolveHighlightGenerationRequest: a duplicate request (already queued/processing) returns 202 with the EXISTING pending generation's status, not an error", async () => {
  const { resolveHighlightGenerationRequest } = await import("./generate-request");
  const state: HighlightGenerationState = {
    highlightMode: "automatic",
    publishedGenerationId: "gen-old-published",
    pendingGenerationId: "gen-already-pending",
    generationStatus: "processing",
    lastGeneratedMediaCount: 42,
  };
  const result = await resolveHighlightGenerationRequest(EVENT_ID, {
    // force: true can never queue a second generation on top of one already
    // queued/processing — requestHighlightGeneration itself returns null in
    // that case (see highlight-service.ts).
    requestHighlightGeneration: async () => null,
    getHighlightGenerationState: async () => state,
  });
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, {
    generation: { id: "gen-already-pending", status: "processing", mediaCount: 42 },
    alreadyPending: true,
  });
});

test("resolveHighlightGenerationRequest: an unknown event returns 404", async () => {
  const { resolveHighlightGenerationRequest } = await import("./generate-request");
  const result = await resolveHighlightGenerationRequest("no-such-event", {
    requestHighlightGeneration: async () => null,
    getHighlightGenerationState: async () => null,
  });
  assert.equal(result.status, 404);
});

test("resolveHighlightGenerationRequest passes force: true through to requestHighlightGeneration", async () => {
  const { resolveHighlightGenerationRequest } = await import("./generate-request");
  let capturedForce: boolean | undefined;
  await resolveHighlightGenerationRequest(EVENT_ID, {
    requestHighlightGeneration: async (_eventId, force) => {
      capturedForce = force;
      return null;
    },
    getHighlightGenerationState: async () => null,
  });
  assert.equal(capturedForce, true);
});
