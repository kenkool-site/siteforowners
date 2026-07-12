import test from "node:test";
import assert from "node:assert/strict";
import { estimateDeliveryUpdate } from "./estimate-delivery";

test("maps independent text and email results", () => {
  assert.deepEqual(
    estimateDeliveryUpdate(
      { state: "sent", providerId: "SM1" },
      { state: "failed", error: "Resend unavailable", destination: "owner@example.com" },
    ),
    {
      text_notification_state: "sent",
      text_provider_message_id: "SM1",
      text_provider_error: null,
      email_notification_state: "failed",
      email_provider_message_id: null,
      email_provider_error: "Resend unavailable",
      email_notification_destination: "owner@example.com",
    },
  );
});
