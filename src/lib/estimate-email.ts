import { Resend } from "resend";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import type { PreferredResponse } from "@/lib/validation/estimate-request";

export interface EstimateEmailInput {
  businessName: string;
  customerName: string;
  customerPhone: string;
  serviceNeeded: string;
  jobLocation: string;
  description: string;
  preferredResponse: PreferredResponse;
  locale: HomeServicesLocale;
  photoLinks: string[];
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
  const spanish = input.locale === "es";
  const responseLabels: Record<PreferredResponse, string> = spanish
    ? { call: "Llamada", sms: "SMS", whatsapp: "WhatsApp" }
    : { call: "Call", sms: "SMS", whatsapp: "WhatsApp" };
  const details = input.description.trim()
    ? `\n${spanish ? "Detalles" : "Details"}: ${sanitizeEstimateText(input.description)}`
    : "";
  const photos = input.photoLinks.map((link, index) =>
    `\n${spanish ? "Foto" : "Photo"} ${index + 1}: ${sanitizeEstimateText(link)}`,
  ).join("");
  return {
    subject: `New estimate request — ${sanitizeEstimateText(input.businessName)}`,
    text: `${spanish ? "Cliente" : "Customer"}: ${sanitizeEstimateText(input.customerName)}\n${spanish ? "Teléfono" : "Phone"}: ${sanitizeEstimateText(input.customerPhone)}\n${spanish ? "Servicio" : "Service"}: ${sanitizeEstimateText(input.serviceNeeded)}\n${spanish ? "Ubicación" : "Location"}: ${sanitizeEstimateText(input.jobLocation)}\n${spanish ? "Respuesta preferida" : "Preferred response"}: ${responseLabels[input.preferredResponse]}${details}${photos}`,
  };
}

function configuredClient(): EstimateEmailClient | null {
  return process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
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
  } catch (error: unknown) {
    console.error("[estimate email] unexpected provider rejection", error);
    return { ok: false, error: "Email delivery failed" };
  }
}
