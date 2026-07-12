import { Resend } from "resend";

export interface EstimateEmailInput {
  businessName: string;
  customerName: string;
  customerPhone: string;
  serviceNeeded: string;
  jobLocation: string;
  description: string;
}

interface EstimateEmailPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
}

interface EstimateEmailProviderResult {
  data: { id: string } | null;
  error: unknown;
}

export interface EstimateEmailClient {
  emails: {
    send(payload: EstimateEmailPayload): Promise<EstimateEmailProviderResult>;
  };
}

export interface SendEstimateEmailOptions {
  client?: EstimateEmailClient | null;
  from?: string;
}

export type SendEstimateEmailResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

const DEFAULT_FROM = "SiteForOwners <hello@siteforowners.com>";

export function selectEstimateOwnerEmail(tenant: {
  email?: string | null;
  admin_email?: string | null;
}): string | null {
  return tenant.email?.trim() || tenant.admin_email?.trim() || null;
}

function sanitizeEstimateText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatEstimateEmail(input: EstimateEmailInput): {
  subject: string;
  text: string;
} {
  const details = input.description.trim()
    ? `\nDetails: ${sanitizeEstimateText(input.description)}`
    : "";
  return {
    subject: `New estimate request — ${sanitizeEstimateText(input.businessName)}`,
    text: `Customer: ${sanitizeEstimateText(input.customerName)}\nPhone: ${sanitizeEstimateText(input.customerPhone)}\nService: ${sanitizeEstimateText(input.serviceNeeded)}\nLocation: ${sanitizeEstimateText(input.jobLocation)}${details}`,
  };
}

function configuredClient(): EstimateEmailClient | null {
  return process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY) as EstimateEmailClient
    : null;
}

export async function sendEstimateEmail(
  destination: string,
  input: EstimateEmailInput,
  options: SendEstimateEmailOptions = {},
): Promise<SendEstimateEmailResult> {
  const client = options.client === undefined ? configuredClient() : options.client;
  if (!client) return { ok: false, error: "Email provider not configured" };

  const email = formatEstimateEmail(input);
  try {
    const result = await client.emails.send({
      from: options.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to: destination,
      ...email,
    });
    if (result.error || !result.data?.id) {
      return { ok: false, error: "Email delivery failed" };
    }
    return { ok: true, providerId: result.data.id };
  } catch {
    return { ok: false, error: "Email delivery failed" };
  }
}
