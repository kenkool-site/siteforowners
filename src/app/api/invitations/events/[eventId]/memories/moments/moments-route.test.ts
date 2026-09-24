import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

const EVENT_ID = "event-1";
const BASE_URL = `http://localhost:3000/api/invitations/events/${EVENT_ID}/memories/moments`;

function sameOriginHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...extra };
}

// Matches highlights-route.test.ts's own founderRequest helper and its
// rationale: a founder/admin_session request never touches the database in
// requireInvitationAccess (unlike the owner-session branch), so it's the
// only way to exercise "authenticated + past the guard" behavior under
// tsx --test without a real Supabase instance.
function founderRequest(method: string, body?: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  process.env.ADMIN_PASSWORD = "test-admin-password";
  return new NextRequest(new URL(BASE_URL), {
    method,
    headers: { ...sameOriginHeaders(extraHeaders), cookie: "admin_session=test-admin-password" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("moments route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
  assert.equal(typeof mod.POST, "function");
  assert.equal(typeof mod.PATCH, "function");
  assert.equal(typeof mod.DELETE, "function");
});

test("POST rejects a name over 80 characters with 400 instead of silently truncating it", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", {
    name: "x".repeat(81),
    startsAt: "2026-09-24T10:00:00Z",
    endsAt: "2026-09-24T11:00:00Z",
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("POST accepts an 80-character name (boundary)", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", {
    name: "x".repeat(80),
    startsAt: "2026-09-24T10:00:00Z",
    endsAt: "2026-09-24T11:00:00Z",
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.notEqual(response.status, 400);
});

test("PATCH rejects a cross-origin request with 403", async () => {
  const { PATCH } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "PATCH",
    headers: { origin: "http://attacker.example", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ id: "moment-1", name: "Cake" }),
  });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("PATCH rejects an unauthenticated same-origin request with 401", async () => {
  const { PATCH } = await import("./route");
  delete process.env.ADMIN_PASSWORD;
  const request = new NextRequest(new URL(BASE_URL), {
    method: "PATCH",
    headers: sameOriginHeaders(),
    body: JSON.stringify({ id: "moment-1", name: "Cake" }),
  });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("PATCH rejects a missing id with 400 before touching the database", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { name: "Cake" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /id/i);
});

test("PATCH rejects a blank name with 400 before touching the database", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", name: "   " });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects a name over 80 characters with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", name: "x".repeat(81) });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an unparseable startsAt with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", startsAt: "not-a-date" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an unparseable endsAt with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", endsAt: "not-a-date" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects a non-numeric sortOrder with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", sortOrder: "first" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects a call with no fields to change with 400, before touching the database", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /no changes/i);
});

test("PATCH with valid fields passes validation and reaches the not-found/database branch", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { id: "moment-1", name: "Reception" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  // This test environment has no real moment with this id, so the handler's
  // own re-scoped existence check is what actually answers — a 404 (or a 500
  // if Supabase itself is unreachable here) is proof every guard and format
  // check was cleared, not a validation rejection.
  assert.notEqual(response.status, 400);
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});

test("DELETE rejects a cross-origin request with 403", async () => {
  const { DELETE } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "DELETE",
    headers: { origin: "http://attacker.example", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ id: "moment-1" }),
  });
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("DELETE rejects an unauthenticated same-origin request with 401", async () => {
  const { DELETE } = await import("./route");
  delete process.env.ADMIN_PASSWORD;
  const request = new NextRequest(new URL(BASE_URL), {
    method: "DELETE",
    headers: sameOriginHeaders(),
    body: JSON.stringify({ id: "moment-1" }),
  });
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("DELETE rejects a missing id with 400", async () => {
  const { DELETE } = await import("./route");
  const request = founderRequest("DELETE", {});
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("DELETE with a valid id passes validation and reaches the not-found/database branch", async () => {
  const { DELETE } = await import("./route");
  const request = founderRequest("DELETE", { id: "moment-1" });
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.notEqual(response.status, 400);
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});
