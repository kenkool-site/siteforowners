import assert from "node:assert/strict";
import test from "node:test";
import { canRetryChannel, channelDiagnostic } from "./estimate-admin-diagnostics";

test("list projection returns independent text and email diagnostics", () => {
  const row = {
    text_notification_state: "failed", notification_destination: "+15550001111",
    text_provider_message_id: "text-id", text_provider_error: "text-error",
    email_notification_state: "sent", email_notification_destination: "owner@example.com",
    email_provider_message_id: "email-id", email_provider_error: null,
  };
  assert.deepEqual(channelDiagnostic(row, "text"), { state: "failed", destination: "+15550001111", providerId: "text-id", error: "text-error" });
  assert.deepEqual(channelDiagnostic(row, "email"), { state: "sent", destination: "owner@example.com", providerId: "email-id", error: null });
});

test("retry visibility requires failed state and configured destination independently", () => {
  const diagnostic = (state: "not_configured" | "pending" | "sent" | "failed", destination: string | null) => ({ state, destination, providerId: null, error: state === "failed" ? "specific error" : null });
  assert.equal(canRetryChannel(diagnostic("failed", "+15550001111")), true);
  assert.equal(canRetryChannel(diagnostic("failed", null)), false);
  assert.equal(canRetryChannel(diagnostic("sent", "+15550001111")), false);
  assert.equal(canRetryChannel(diagnostic("pending", "+15550001111")), false);
});
