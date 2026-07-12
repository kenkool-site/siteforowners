import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEstimateEmail,
  selectEstimateOwnerEmail,
  sendEstimateEmail,
  type EstimateEmailClient,
} from "./estimate-email";

const input = {
  businessName: " Acme\nPlumbing ",
  customerName: " Jane\rDoe ",
  customerPhone: "+1 212 555 0100",
  serviceNeeded: " Leak\tRepair ",
  jobLocation: " 12 Main St ",
  description: " Kitchen\n sink ",
  preferredResponse: "call" as const,
  locale: "es" as const,
  photoLinks: ["https://photos.example/one", "https://photos.example/two"],
};

test("prefers tenant email then admin email", () => {
  assert.equal(selectEstimateOwnerEmail({ email: " owner@example.com ", admin_email: "admin@example.com" }), "owner@example.com");
  assert.equal(selectEstimateOwnerEmail({ email: null, admin_email: " admin@example.com " }), "admin@example.com");
  assert.equal(selectEstimateOwnerEmail({ email: null, admin_email: null }), null);
});

test("formats and sanitizes an estimate email", () => {
  const email = formatEstimateEmail(input);
  assert.equal(email.subject, "New estimate request — Acme Plumbing");
  assert.equal(email.text, "Cliente: Jane Doe\nTeléfono: +1 212 555 0100\nServicio: Leak Repair\nUbicación: 12 Main St\nRespuesta preferida: Llamada\nDetalles: Kitchen sink\nFoto 1: https://photos.example/one\nFoto 2: https://photos.example/two");
});

test("omits empty optional description", () => {
  const email = formatEstimateEmail({ ...input, description: "" });
  assert.doesNotMatch(email.text, /Details:/);
  assert.match(email.subject, /New estimate request/);
});

test("sends with an injected client and returns the provider id", async () => {
  let payload: unknown;
  const client: EstimateEmailClient = {
    emails: {
      send: async (value) => {
        payload = value;
        return { data: { id: "em_1" }, error: null };
      },
    },
  };

  assert.deepEqual(await sendEstimateEmail("owner@example.com", input, { client, from: "Estimates <estimates@example.com>" }), { ok: true, providerId: "em_1" });
  assert.deepEqual(payload, {
    from: "Estimates <estimates@example.com>",
    to: "owner@example.com",
    subject: "New estimate request — Acme Plumbing",
    text: "Cliente: Jane Doe\nTeléfono: +1 212 555 0100\nServicio: Leak Repair\nUbicación: 12 Main St\nRespuesta preferida: Llamada\nDetalles: Kitchen sink\nFoto 1: https://photos.example/one\nFoto 2: https://photos.example/two",
  });
});

test("logs an unexpected provider rejection but returns a stable safe error", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const client: EstimateEmailClient = {
      emails: { send: async () => { throw new Error("secret provider rejection"); } },
    };
    assert.deepEqual(await sendEstimateEmail("owner@example.com", input, { client }), { ok: false, error: "Email delivery failed" });
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /estimate email/i);
    assert.match(String(logged[0][1]), /secret provider rejection/i);
  } finally {
    console.error = original;
  }
});

test("returns a safe error when the provider rejects delivery", async () => {
  const client: EstimateEmailClient = {
    emails: { send: async () => ({ data: null, error: { message: "secret provider detail" } }) },
  };
  assert.deepEqual(await sendEstimateEmail("owner@example.com", input, { client }), { ok: false, error: "Email delivery failed" });
});
