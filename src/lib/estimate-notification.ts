import type { EstimateDeliveryChannel } from "@/lib/home-services/types";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import {
  getTwilioMessageClient,
  sendTwilioMessage,
  toE164,
  type TwilioMessageClient,
} from "@/lib/sms";
import type { PreferredResponse } from "@/lib/validation/estimate-request";

export const ESTIMATE_MESSAGE_MAX_LENGTH = 1500;

export interface EstimateMessageInput {
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

export type SendEstimateResult =
  | { ok: true; messageSid: string; providerStatus: string; channel: EstimateDeliveryChannel }
  | { ok: false; error: string; channel: EstimateDeliveryChannel };

const PREFERRED_RESPONSE_LABELS: Record<
  HomeServicesLocale,
  Record<PreferredResponse, string>
> = {
  en: { call: "Call", sms: "SMS", whatsapp: "WhatsApp" },
  es: { call: "Llamada", sms: "SMS", whatsapp: "WhatsApp" },
};

function sanitizeField(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredResponseLabel(locale: HomeServicesLocale, preferred: PreferredResponse): string {
  return PREFERRED_RESPONSE_LABELS[locale][preferred];
}

function buildEstimateMessageBody(input: EstimateMessageInput): string {
  const locale = input.locale;
  const lines = locale === "es"
    ? [
        `Nueva solicitud de estimado — ${sanitizeField(input.businessName)}`,
        `Cliente: ${sanitizeField(input.customerName)} · ${sanitizeField(input.customerPhone)}`,
        `Servicio: ${sanitizeField(input.serviceNeeded)}`,
        `Ubicación: ${sanitizeField(input.jobLocation)}`,
        `Preferencia: ${preferredResponseLabel(locale, input.preferredResponse)}`,
        `Detalles: ${sanitizeField(input.description)}`,
      ]
    : [
        `New estimate request — ${sanitizeField(input.businessName)}`,
        `Customer: ${sanitizeField(input.customerName)} · ${sanitizeField(input.customerPhone)}`,
        `Service: ${sanitizeField(input.serviceNeeded)}`,
        `Location: ${sanitizeField(input.jobLocation)}`,
        `Preferred response: ${preferredResponseLabel(locale, input.preferredResponse)}`,
        `Details: ${sanitizeField(input.description)}`,
      ];

  input.photoLinks.forEach((link, index) => {
    const label = locale === "es" ? `Foto ${index + 1}` : `Photo ${index + 1}`;
    lines.push(`${label}: ${link}`);
  });

  return lines.join("\n");
}

function truncateEstimateMessage(body: string, maxLength = ESTIMATE_MESSAGE_MAX_LENGTH): string {
  if (body.length <= maxLength) return body;
  const suffix = "…";
  return `${body.slice(0, maxLength - suffix.length)}${suffix}`;
}

export function formatEstimateMessage(input: EstimateMessageInput): string {
  return truncateEstimateMessage(buildEstimateMessageBody(input));
}

export interface SendEstimateNotificationOptions {
  client?: TwilioMessageClient | null;
  fromNumber?: string;
  whatsappFrom?: string;
  whatsappContentSid?: string;
}

export async function sendEstimateNotification(
  messageBody: string,
  channel: EstimateDeliveryChannel,
  destinationE164: string,
  options: SendEstimateNotificationOptions = {},
): Promise<SendEstimateResult> {
  const twilioClient = options.client === undefined ? getTwilioMessageClient() : options.client;
  if (!twilioClient) {
    return { ok: false, error: "Twilio client not configured", channel };
  }

  const destination = toE164(destinationE164);
  if (!destination) {
    return { ok: false, error: "Invalid destination phone number", channel };
  }

  if (channel === "sms") {
    const fromNumber = options.fromNumber ?? process.env.TWILIO_FROM;
    if (!fromNumber) {
      return { ok: false, error: "SMS sender not configured", channel };
    }
    const result = await sendTwilioMessage(twilioClient, {
      body: messageBody,
      to: destination,
      from: fromNumber,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, channel };
    }
    return {
      ok: true,
      messageSid: result.sid,
      providerStatus: result.status,
      channel,
    };
  }

  const whatsappFrom = options.whatsappFrom ?? process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = options.whatsappContentSid ?? process.env.TWILIO_WHATSAPP_CONTENT_SID;
  if (!whatsappFrom || !contentSid) {
    return { ok: false, error: "WhatsApp sender or template not configured", channel };
  }

  const result = await sendTwilioMessage(twilioClient, {
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${destination}`,
    contentSid,
    contentVariables: JSON.stringify({ "1": messageBody }),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, channel };
  }
  return {
    ok: true,
    messageSid: result.sid,
    providerStatus: result.status,
    channel,
  };
}
