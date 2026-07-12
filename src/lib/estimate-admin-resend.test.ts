import assert from "node:assert/strict";
import test from "node:test";
import { executeAdminEstimateResend, type ResendDependencies, type RetryResult } from "./estimate-admin-resend";

const tenantId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function harness(found = true) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const result: RetryResult = { ok: true, destination: "destination", providerId: "provider-1", legacy: { channel: "sms", destination: "+15550001111" } };
  const deps: ResendDependencies = {
    findRequest: async (...args) => { calls.push({ name: "find", args }); return found; },
    sendEmail: async (...args) => { calls.push({ name: "email", args }); return result; },
    sendText: async (...args) => { calls.push({ name: "text", args }); return result; },
    updateRequest: async (...args) => { calls.push({ name: "update", args }); },
  };
  return { calls, deps };
}

test("unauthorized resend returns 401 before lookup or either provider", async () => {
  const h = harness();
  const response = await executeAdminEstimateResend(false, { tenantId, requestId, channel: "email" }, h.deps);
  assert.equal(response.status, 401);
  assert.deepEqual(h.calls, []);
});

test("every non-exact channel is rejected without lookup", async () => {
  for (const channel of ["Email", "TEXT", " email", "sms", "whatsapp", "", null, undefined, 1, true]) {
    const h = harness();
    const response = await executeAdminEstimateResend(true, { tenantId, requestId, channel }, h.deps);
    assert.equal(response.status, 400, `channel ${String(channel)}`);
    assert.deepEqual(h.calls, []);
  }
});

test("cross-tenant request is 404 and lookup receives both IDs", async () => {
  const h = harness(false);
  const response = await executeAdminEstimateResend(true, { tenantId, requestId, channel: "text" }, h.deps);
  assert.equal(response.status, 404);
  assert.deepEqual(h.calls, [{ name: "find", args: [requestId, tenantId] }]);
});

test("email retry calls only email and updates only tenant-scoped email fields", async () => {
  const h = harness();
  assert.equal((await executeAdminEstimateResend(true, { tenantId, requestId, channel: "email" }, h.deps)).status, 200);
  assert.deepEqual(h.calls.map((call) => call.name), ["find", "email", "update"]);
  assert.deepEqual(h.calls[2].args, [requestId, tenantId, {
    email_notification_state: "sent", email_notification_destination: "destination",
    email_provider_message_id: "provider-1", email_provider_error: null,
  }]);
});

test("text retry calls only text and updates text plus legacy compatibility fields", async () => {
  const h = harness();
  assert.equal((await executeAdminEstimateResend(true, { tenantId, requestId, channel: "text" }, h.deps)).status, 200);
  assert.deepEqual(h.calls.map((call) => call.name), ["find", "text", "update"]);
  const fields = h.calls[2].args[2] as Record<string, unknown>;
  assert.deepEqual(Object.keys(fields).sort(), ["notification_channel", "notification_destination", "notification_state", "notified_at", "provider_error", "provider_message_id", "text_notification_state", "text_provider_error", "text_provider_message_id"].sort());
  assert.equal(fields.notification_channel, "sms");
  assert.equal(fields.text_provider_message_id, "provider-1");
});
