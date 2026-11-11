import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const BASE = `http://localhost:3000/api/invitations/events/${EVENT_ID}/memories/guests-of-honor`;

function guestRequest(method: string, path = "", body?: unknown): NextRequest {
  return new NextRequest(new URL(BASE + path), {
    method,
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      cookie: "memories_guest_session=not-a-host",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("a guest session cannot read or change guests of honor", async () => {
  const root = await import("./route");
  const confirm = await import("./confirm/route");
  const detect = await import("./detect/route");
  const exclude = await import("./exclude/route");
  const reference = await import("./reference/route");
  const params = { eventId: EVENT_ID };

  const get = await root.GET(guestRequest("GET"), { params });
  assert.equal(get.status, 401);

  const removed = await root.DELETE(guestRequest("DELETE"), { params });
  assert.equal(removed.status, 401);

  const confirmed = await confirm.POST(guestRequest("POST", "/confirm", {
    consent: true,
    faces: [{ index: 0, name: "Mercy", roleKey: "bride", selected: true }],
  }), { params });
  assert.equal(confirmed.status, 401);

  const detected = await detect.POST(guestRequest("POST", "/detect", { sourceKind: "event_site", sourceRef: "cover" }), { params });
  assert.equal(detected.status, 401);

  const excluded = await exclude.POST(guestRequest("POST", "/exclude", { mediaId: "22222222-2222-4222-8222-222222222222" }), { params });
  assert.equal(excluded.status, 401);

  const photo = await reference.GET(guestRequest("GET", "/reference"), { params });
  assert.equal(photo.status, 401);
});

test("cross-origin writes are rejected before any host check", async () => {
  const { POST } = await import("./confirm/route");
  const request = new NextRequest(new URL(`${BASE}/confirm`), {
    method: "POST",
    headers: {
      origin: "http://attacker.example",
      host: "localhost:3000",
      "content-type": "application/json",
      cookie: "admin_session=test-admin-password",
    },
    body: JSON.stringify({ consent: true, faces: [] }),
  });
  const response = await POST(request, { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 403);
});

test("host routes authorize with the invitation host guard and ignore the guest memories cookie", () => {
  const guard = readFileSync(new URL("../../../../../../../lib/invitations/memories/honor-http.ts", import.meta.url), "utf8");
  assert.match(guard, /requireInvitationAccess\(request, eventId\)/);
  assert.doesNotMatch(guard, /memories_guest_session/);
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const confirm = readFileSync(new URL("./confirm/route.ts", import.meta.url), "utf8");
  const detect = readFileSync(new URL("./detect/route.ts", import.meta.url), "utf8");
  const exclude = readFileSync(new URL("./exclude/route.ts", import.meta.url), "utf8");
  for (const source of [route, confirm, detect, exclude]) {
    assert.match(source, /honorHostGuard\(/);
    assert.doesNotMatch(source, /memories_guest_session/);
  }
});
