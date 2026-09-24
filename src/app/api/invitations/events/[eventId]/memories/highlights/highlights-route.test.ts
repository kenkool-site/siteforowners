import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

const EVENT_ID = "event-1";
const BASE_URL = `http://localhost:3000/api/invitations/events/${EVENT_ID}/memories/highlights`;

function sameOriginHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...extra };
}

// A founder/admin_session request never touches the database in
// requireInvitationAccess (unlike the owner-session branch, which calls
// invitationOwnerOwnsEvent), so it's the only way to genuinely exercise
// "authenticated + past the guard" behavior under tsx --test without a real
// Supabase instance — see repository.test.ts's own header comment on why
// this codebase's DB-backed functions have no injection seam to mock instead.
function founderRequest(method: string, body?: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  process.env.ADMIN_PASSWORD = "test-admin-password";
  return new NextRequest(new URL(BASE_URL), {
    method,
    headers: { ...sameOriginHeaders(extraHeaders), cookie: "admin_session=test-admin-password" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("highlights route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
  assert.equal(typeof mod.POST, "function");
  assert.equal(typeof mod.PATCH, "function");
  assert.equal(typeof mod.DELETE, "function");
});

test("GET rejects an unauthenticated request with 401", async () => {
  const { GET } = await import("./route");
  delete process.env.ADMIN_PASSWORD;
  const request = new NextRequest(new URL(BASE_URL));
  const response = await GET(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("POST rejects a cross-origin request with 403", async () => {
  const { POST } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: { origin: "http://attacker.example", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ name: "Cake" }),
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("POST rejects an unauthenticated same-origin request with 401", async () => {
  const { POST } = await import("./route");
  delete process.env.ADMIN_PASSWORD;
  const request = new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: sameOriginHeaders(),
    body: JSON.stringify({ name: "Cake" }),
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("PATCH rejects a cross-origin request with 403", async () => {
  const { PATCH } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "PATCH",
    headers: { origin: "http://attacker.example", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ action: "set_mode", mode: "automatic" }),
  });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("DELETE rejects a cross-origin request with 403", async () => {
  const { DELETE } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "DELETE",
    headers: { origin: "http://attacker.example", host: "localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ id: "group-1" }),
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
    body: JSON.stringify({ id: "group-1" }),
  });
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 401);
});

test("POST grants founder/admin access and rejects a blank name with 400 before touching the database", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", { name: "   " });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /name/i);
});

test("POST rejects a name over 80 characters with 400", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", { name: "x".repeat(81) });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("POST accepts an 80-character name (boundary) and reaches the database call", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", { name: "x".repeat(80) });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  // Validation passed (not 400); this environment has no real Supabase
  // instance, so the actual write fails with 500 — that failure is itself
  // proof the handler got past every guard and validation check.
  assert.notEqual(response.status, 400);
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});

test("POST rejects a description over 300 characters with 400", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", { name: "Cake", description: "x".repeat(301) });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /description/i);
});

test("POST accepts a 300-character description (boundary)", async () => {
  const { POST } = await import("./route");
  const request = founderRequest("POST", { name: "Cake", description: "x".repeat(300) });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.notEqual(response.status, 400);
});

test("malformed JSON body returns 400", async () => {
  const { POST } = await import("./route");
  const request = new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: { ...sameOriginHeaders(), cookie: "admin_session=test-admin-password" },
    body: "not valid json",
  });
  process.env.ADMIN_PASSWORD = "test-admin-password";
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an invalid highlight mode with 400 before touching the database", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "set_mode", mode: "not-a-real-mode" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH accepts each valid highlight mode value (passes validation)", async () => {
  const { PATCH } = await import("./route");
  for (const mode of ["automatic", "host_defined"]) {
    const request = founderRequest("PATCH", { action: "set_mode", mode });
    const response = await PATCH(request, { params: { eventId: EVENT_ID } });
    assert.notEqual(response.status, 400, `mode ${mode} should pass validation`);
  }
});

test("PATCH rejects an update_group call missing an id with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "update_group", name: "Cake" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an update_group call with an over-80-character name with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "update_group", id: "group-1", name: "x".repeat(81) });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an update_group call with an over-300-character description with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "update_group", id: "group-1", description: "x".repeat(301) });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an update_group call with no fields to change with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "update_group", id: "group-1" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("PATCH rejects an unrecognized action with 400", async () => {
  const { PATCH } = await import("./route");
  const request = founderRequest("PATCH", { action: "not-a-real-action" });
  const response = await PATCH(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

test("DELETE rejects a missing id with 400", async () => {
  const { DELETE } = await import("./route");
  const request = founderRequest("DELETE", {});
  const response = await DELETE(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 400);
});

// Structural: cross-event/other-source group ids must be rejected before any
// write, and switching mode must only queue a regeneration AFTER the mode
// write succeeds. Both sit behind requireInvitationAccess()/createAdminClient(),
// neither reachable from here without a real Supabase instance — matching
// the route-contract convention in settings-route.test.ts/moderation-
// route.test.ts, this asserts the source actually wires the guard in.
test("update_group and delete both re-scope to host_defined groups for this event before mutating", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const listCalls = source.match(/listMemoryHighlightGroups\(params\.eventId, "host_defined"\)/g) ?? [];
  assert.ok(listCalls.length >= 2, "expected both update_group and delete to re-scope via listMemoryHighlightGroups(...,'host_defined')");
  assert.match(source, /findHostDefinedGroup\(groups, /);
});

test("switching mode queues a highlight generation only after the mode write succeeds", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const writeIndex = source.indexOf("updateEventHighlightMode(");
  const queueIndex = source.indexOf("requestHighlightGeneration(");
  assert.notEqual(writeIndex, -1, "expected a call to updateEventHighlightMode");
  assert.notEqual(queueIndex, -1, "expected a call to requestHighlightGeneration");
  assert.ok(queueIndex > writeIndex, "requestHighlightGeneration must be called after updateEventHighlightMode");
});

// Pure validation/lookup helpers — unit tested directly, since these hold the
// actual boundary-condition logic (blank/over-length names, over-length
// descriptions, cross-event group ids) the route delegates to.
test("validateGroupName: blank name is rejected", async () => {
  const { validateGroupName } = await import("./highlight-validation");
  assert.equal(validateGroupName("   ").ok, false);
  assert.equal(validateGroupName("").ok, false);
  assert.equal(validateGroupName(undefined).ok, false);
});

test("validateGroupName: accepts up to 80 characters, rejects 81+", async () => {
  const { validateGroupName } = await import("./highlight-validation");
  const eighty = "x".repeat(80);
  const eightyOne = "x".repeat(81);
  const ok = validateGroupName(eighty);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, eighty);
  assert.equal(validateGroupName(eightyOne).ok, false);
});

test("validateGroupName: trims surrounding whitespace", async () => {
  const { validateGroupName } = await import("./highlight-validation");
  const result = validateGroupName("  Cake  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "Cake");
});

test("validateGroupDescription: accepts up to 300 characters, rejects 301+", async () => {
  const { validateGroupDescription } = await import("./highlight-validation");
  const threeHundred = "x".repeat(300);
  const threeHundredOne = "x".repeat(301);
  const ok = validateGroupDescription(threeHundred);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, threeHundred);
  assert.equal(validateGroupDescription(threeHundredOne).ok, false);
});

test("validateGroupDescription: undefined/null/blank all normalize to null (no description)", async () => {
  const { validateGroupDescription } = await import("./highlight-validation");
  for (const input of [undefined, null, "   "]) {
    const result = validateGroupDescription(input);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, null);
  }
});

test("isValidHighlightMode: accepts automatic/host_defined, rejects anything else", async () => {
  const { isValidHighlightMode } = await import("./highlight-validation");
  assert.equal(isValidHighlightMode("automatic"), true);
  assert.equal(isValidHighlightMode("host_defined"), true);
  assert.equal(isValidHighlightMode("fallback"), false);
  assert.equal(isValidHighlightMode(undefined), false);
  assert.equal(isValidHighlightMode(123), false);
});

test("findHostDefinedGroup: a group id absent from the event-scoped list (e.g. belongs to another event) is not found", async () => {
  const { findHostDefinedGroup } = await import("./highlight-validation");
  const groups = [
    {
      id: "group-1",
      eventId: "event-1",
      name: "Cake",
      description: null,
      semanticKey: "k1",
      source: "host_defined" as const,
      sortOrder: 0,
      isVisible: true,
    },
  ];
  assert.equal(findHostDefinedGroup(groups, "group-from-another-event"), undefined);
  assert.equal(findHostDefinedGroup(groups, "group-1"), groups[0]);
  assert.equal(findHostDefinedGroup(groups, undefined), undefined);
});
