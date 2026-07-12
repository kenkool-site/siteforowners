export type ChannelDiagnostic = {
  state: "not_configured" | "pending" | "sent" | "failed";
  destination: string | null;
  providerId: string | null;
  error: string | null;
};

export function channelDiagnostic(row: Record<string, unknown>, channel: "text" | "email"): ChannelDiagnostic {
  const prefix = channel === "text" ? "text" : "email";
  return {
    state: row[`${prefix}_notification_state`] as ChannelDiagnostic["state"],
    destination: (channel === "text" ? row.notification_destination : row.email_notification_destination) as string | null,
    providerId: row[`${prefix}_provider_message_id`] as string | null,
    error: row[`${prefix}_provider_error`] as string | null,
  };
}

export function canRetryChannel(diagnostic: ChannelDiagnostic): boolean {
  return diagnostic.state === "failed" && Boolean(diagnostic.destination);
}
