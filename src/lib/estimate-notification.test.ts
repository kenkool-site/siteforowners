import assert from "node:assert/strict";
import test from "node:test";
import {
  ESTIMATE_MESSAGE_MAX_LENGTH,
  formatEstimateMessage,
  deliverEstimateText,
  sendEstimateNotification,
  type EstimateMessageInput,
} from "./estimate-notification";
import type { HomeServicesNotificationConfig } from "./home-services/types";
import type { TwilioMessageClient } from "./sms";

function sampleInput(overrides: Partial<EstimateMessageInput> = {}): EstimateMessageInput {
  return {
    businessName: "Green Lawn Pros",
    customerName: "Ana Rivera",
    customerPhone: "+18325550147",
    serviceNeeded: "Sprinkler Repair",
    jobLocation: "Richmond, TX",
    description: "One zone does not turn on.",
    preferredResponse: "whatsapp",
    locale: "en",
    photoLinks: [
      "https://example.com/photo-1?sig=abc",
      "https://example.com/photo-2?sig=def",
    ],
    ...overrides,
  };
}

test("formatEstimateMessage includes business, customer, service, location, preferred response, description, and links", () => {
  const message = formatEstimateMessage(sampleInput());
  assert.match(message, /Green Lawn Pros/);
  assert.match(message, /Ana Rivera/);
  assert.match(message, /\+18325550147/);
  assert.match(message, /Sprinkler Repair/);
  assert.match(message, /Richmond, TX/);
  assert.match(message, /WhatsApp/);
  assert.match(message, /One zone does not turn on\./);
  assert.match(message, /https:\/\/example\.com\/photo-1\?sig=abc/);
  assert.match(message, /https:\/\/example\.com\/photo-2\?sig=def/);
});

test("formatEstimateMessage uses Spanish labels for es locale", () => {
  const message = formatEstimateMessage(sampleInput({ locale: "es", preferredResponse: "call" }));
  assert.match(message, /Nueva solicitud de estimado/);
  assert.match(message, /Cliente:/);
  assert.match(message, /Servicio:/);
  assert.match(message, /Ubicación:/);
  assert.match(message, /Preferencia: Llamada/);
  assert.match(message, /Detalles:/);
  assert.match(message, /Foto 1:/);
});

test("formatEstimateMessage removes control characters from untrusted fields", () => {
  const message = formatEstimateMessage(sampleInput({
    customerName: "Ana\u0007Rivera",
    description: "Zone\u0001 offline\u0002",
  }));
  assert.doesNotMatch(message, /\u0007/);
  assert.doesNotMatch(message, /\u0001/);
  assert.doesNotMatch(message, /\u0002/);
  assert.match(message, /Ana Rivera/);
  assert.match(message, /Zone offline/);
});

test("formatEstimateMessage output is at most 1500 characters", () => {
  const message = formatEstimateMessage(sampleInput({
    description: "x".repeat(3000),
    photoLinks: Array.from({ length: 5 }, (_, index) => `https://example.com/p${index}?sig=${"y".repeat(200)}`),
  }));
  assert.ok(message.length <= ESTIMATE_MESSAGE_MAX_LENGTH);
});

test("sendEstimateNotification sends SMS via messages.create and returns SID", async () => {
  const calls: Record<string, string>[] = [];
  const client: TwilioMessageClient = {
    messages: {
      create: async (input) => {
        calls.push(input);
        return { sid: "SM123", status: "queued" };
      },
    },
  };

  const result = await sendEstimateNotification(
    "New estimate request",
    "sms",
    "+18325550147",
    { client, fromNumber: "+14155550100" },
  );

  assert.deepEqual(result, {
    ok: true,
    messageSid: "SM123",
    providerStatus: "queued",
    channel: "sms",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    body: "New estimate request",
    to: "+18325550147",
    from: "+14155550100",
  });
});

test("sendEstimateNotification sends WhatsApp via approved template variables", async () => {
  const calls: Record<string, string>[] = [];
  const client: TwilioMessageClient = {
    messages: {
      create: async (input) => {
        calls.push(input);
        return { sid: "WA123", status: "accepted" };
      },
    },
  };

  const body = "New estimate request — Green Lawn Pros";
  const result = await sendEstimateNotification(
    body,
    "whatsapp",
    "+18325550147",
    {
      client,
      whatsappFrom: "+14155238886",
      whatsappContentSid: "HXabc123",
    },
  );

  assert.deepEqual(result, {
    ok: true,
    messageSid: "WA123",
    providerStatus: "accepted",
    channel: "whatsapp",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    from: "whatsapp:+14155238886",
    to: "whatsapp:+18325550147",
    contentSid: "HXabc123",
    contentVariables: JSON.stringify({ "1": body }),
  });
});

test("sendEstimateNotification returns failure result when Twilio rejects", async () => {
  const client: TwilioMessageClient = {
    messages: {
      create: async () => {
        const err = new Error("Unable to create record") as Error & { code: number; status: number };
        err.code = 21211;
        err.status = 400;
        throw err;
      },
    },
  };

  const result = await sendEstimateNotification(
    "New estimate request",
    "sms",
    "+18325550147",
    { client, fromNumber: "+14155550100" },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.channel, "sms");
    assert.match(result.error, /code=21211/);
    assert.match(result.error, /status=400/);
    assert.doesNotMatch(result.error, /TWILIO_AUTH_TOKEN/i);
  }
});

test("sendEstimateNotification returns WhatsApp config failure without calling Twilio", async () => {
  let called = false;
  const client: TwilioMessageClient = {
    messages: {
      create: async () => {
        called = true;
        return { sid: "WA123", status: "accepted" };
      },
    },
  };

  const result = await sendEstimateNotification(
    "New estimate request",
    "whatsapp",
    "+18325550147",
    { client, whatsappFrom: "+14155238886" },
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    error: "WhatsApp sender or template not configured",
    channel: "whatsapp",
  });
});

test("deliverEstimateText falls back from WhatsApp to SMS", async () => {
  const calls: Array<{ channel: string; destination: string }> = [];
  const config: HomeServicesNotificationConfig = {
    channel: "whatsapp",
    destination_e164: "+18325550147",
    sms_fallback_e164: "+18325550148",
  };
  const result = await deliverEstimateText("body", config, async (_body, channel, destination) => {
    calls.push({ channel, destination });
    return channel === "whatsapp"
      ? { ok: false, error: "rejected", channel }
      : { ok: true, messageSid: "SM2", providerStatus: "queued", channel };
  });
  assert.deepEqual(calls, [
    { channel: "whatsapp", destination: "+18325550147" },
    { channel: "sms", destination: "+18325550148" },
  ]);
  assert.deepEqual(result, {
    result: { state: "sent", providerId: "SM2", destination: "+18325550148" },
    channel: "sms",
    destination: "+18325550148",
  });
});

test("deliverEstimateText converts a provider rejection into failure", async () => {
  const result = await deliverEstimateText(
    "body",
    { channel: "sms", destination_e164: "+18325550147" },
    async () => { throw new Error("provider down"); },
  );
  assert.deepEqual(result, {
    result: { state: "failed", error: "provider down", destination: "+18325550147" },
    channel: "sms",
    destination: "+18325550147",
  });
});
