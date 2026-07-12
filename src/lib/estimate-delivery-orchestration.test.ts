import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateEstimateDelivery } from "./estimate-delivery-orchestration";
import type { EstimateChannelResult } from "./estimate-delivery";

const sent = (id: string, destination: string): EstimateChannelResult => ({ state: "sent", providerId: id, destination });
const failed = (error: string, destination: string): EstimateChannelResult => ({ state: "failed", error, destination });

for (const scenario of [
  { name: "text success/email failure", text: sent("txt-1", "+15551234567"), email: failed("email down", "owner@example.com") },
  { name: "text failure/email success", text: failed("text down", "+15551234567"), email: sent("mail-1", "owner@example.com") },
  { name: "both failure", text: failed("text down", "+15551234567"), email: failed("email down", "owner@example.com") },
  { name: "email-only", text: { state: "not_configured" } as EstimateChannelResult, email: sent("mail-1", "owner@example.com") },
]) {
  test(`${scenario.name}: persists first, records independent outcomes, and returns public success`, async () => {
    const events: string[] = [];
    let update: Record<string, string | null> | undefined;

    const response = await orchestrateEstimateDelivery({
      persist: async () => { events.push("persist"); return "request-1"; },
      deliverText: async () => { events.push("text"); return scenario.text; },
      deliverEmail: async () => { events.push("email"); return scenario.email; },
      update: async (_id, value) => { events.push("update"); update = value; },
    });

    assert.equal(events[0], "persist");
    assert.deepEqual(new Set(events.slice(1, 3)), new Set(["text", "email"]));
    assert.equal(events[3], "update");
    assert.deepEqual(update, {
      text_notification_state: scenario.text.state,
      text_provider_message_id: scenario.text.state === "sent" ? scenario.text.providerId : null,
      text_provider_error: scenario.text.state === "failed" ? scenario.text.error : null,
      email_notification_state: scenario.email.state,
      email_provider_message_id: scenario.email.state === "sent" ? scenario.email.providerId : null,
      email_provider_error: scenario.email.state === "failed" ? scenario.email.error : null,
      email_notification_destination: scenario.email.destination ?? null,
    });
    assert.deepEqual(response, { ok: true });
  });
}
