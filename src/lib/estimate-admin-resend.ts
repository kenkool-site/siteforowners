export type RetryChannel = "text" | "email";

export type RetryResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
  destination: string;
  legacy?: { channel: string; destination: string };
};

export type ResendDependencies = {
  findRequest: (requestId: string, tenantId: string) => Promise<boolean>;
  sendEmail: (requestId: string, tenantId: string) => Promise<RetryResult | null>;
  sendText: (requestId: string, tenantId: string) => Promise<RetryResult | null>;
  updateRequest: (requestId: string, tenantId: string, fields: Record<string, string | null>) => Promise<void>;
};

export type ResendResponse = { status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function executeAdminEstimateResend(
  authorized: boolean,
  input: unknown,
  deps: ResendDependencies,
): Promise<ResendResponse> {
  if (!authorized) return { status: 401, body: { error: "Unauthorized" } };
  if (!input || typeof input !== "object") return { status: 400, body: { error: "Invalid request" } };
  const body = input as Record<string, unknown>;
  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(requestId)) {
    return { status: 400, body: { error: "tenantId and requestId required" } };
  }
  if (body.channel !== "text" && body.channel !== "email") {
    return { status: 400, body: { error: "channel must be text or email" } };
  }
  if (!(await deps.findRequest(requestId, tenantId))) return { status: 404, body: { error: "Not found" } };

  const channel: RetryChannel = body.channel;
  const delivery = channel === "email"
    ? await deps.sendEmail(requestId, tenantId)
    : await deps.sendText(requestId, tenantId);
  if (!delivery) return { status: 400, body: { error: `${channel === "email" ? "Email" : "Text"} notification not configured` } };

  const fields: Record<string, string | null> = channel === "email" ? {
    email_notification_state: delivery.ok ? "sent" : "failed",
    email_notification_destination: delivery.destination,
    email_provider_message_id: delivery.ok ? delivery.providerId ?? null : null,
    email_provider_error: delivery.ok ? null : delivery.error ?? "Unknown provider error",
  } : {
    text_notification_state: delivery.ok ? "sent" : "failed",
    text_provider_message_id: delivery.ok ? delivery.providerId ?? null : null,
    text_provider_error: delivery.ok ? null : delivery.error ?? "Unknown provider error",
    notification_state: delivery.ok ? "sent" : "failed",
    notification_channel: delivery.legacy?.channel ?? null,
    notification_destination: delivery.legacy?.destination ?? delivery.destination,
    provider_message_id: delivery.ok ? delivery.providerId ?? null : null,
    provider_error: delivery.ok ? null : delivery.error ?? "Unknown provider error",
    notified_at: delivery.ok ? new Date().toISOString() : null,
  };
  await deps.updateRequest(requestId, tenantId, fields);
  return { status: 200, body: { ok: true, channel } };
}
