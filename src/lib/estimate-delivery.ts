export type EstimateChannelResult =
  | { state: "not_configured"; destination?: string }
  | { state: "sent"; providerId: string; destination?: string }
  | { state: "failed"; error: string; destination?: string };

export function estimateDeliveryUpdate(
  text: EstimateChannelResult,
  email: EstimateChannelResult,
): Record<string, string | null> {
  return {
    text_notification_state: text.state,
    text_provider_message_id: text.state === "sent" ? text.providerId : null,
    text_provider_error: text.state === "failed" ? text.error : null,
    email_notification_state: email.state,
    email_provider_message_id: email.state === "sent" ? email.providerId : null,
    email_provider_error: email.state === "failed" ? email.error : null,
    email_notification_destination: email.destination ?? null,
  };
}
