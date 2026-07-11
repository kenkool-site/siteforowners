import type { EstimateDeliveryChannel } from "@/lib/home-services/types";

export function getEstimateTwilioConfigWarning(
  channel?: EstimateDeliveryChannel,
): string | null {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are not configured.";
  }

  if (channel === "sms" && !process.env.TWILIO_FROM) {
    return "SMS delivery requires TWILIO_FROM.";
  }

  if (
    channel === "whatsapp"
    && (!process.env.TWILIO_WHATSAPP_FROM || !process.env.TWILIO_WHATSAPP_CONTENT_SID)
  ) {
    return "WhatsApp delivery requires TWILIO_WHATSAPP_FROM and TWILIO_WHATSAPP_CONTENT_SID.";
  }

  return null;
}
