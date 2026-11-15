import twilio from "twilio";
import { sendTwilioMessage, type TwilioMessageClient } from "@/lib/sms";

export type GuestListSmsConfig =
  | {
      configured: true;
      accountSid: string;
      authToken: string;
      messagingServiceSid: string | null;
      fromNumber: string | null;
    }
  | { configured: false; message: string };

type SmsEnv = Record<string, string | undefined>;

export function readGuestListSmsConfig(env: SmsEnv = process.env): GuestListSmsConfig {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "";
  const fromNumber = (env.TWILIO_FROM_NUMBER || env.TWILIO_FROM || "").trim();
  if (!accountSid || !authToken) {
    return {
      configured: false,
      message: "Texting is turned off until TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set.",
    };
  }
  if (!messagingServiceSid && !fromNumber) {
    return {
      configured: false,
      message: "Texting is turned off until TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER is set.",
    };
  }
  return {
    configured: true,
    accountSid,
    authToken,
    messagingServiceSid: messagingServiceSid || null,
    fromNumber: fromNumber || null,
  };
}

export async function sendGuestListSms(input: {
  to: string;
  body: string;
  statusCallback?: string | null;
  config?: GuestListSmsConfig;
  client?: TwilioMessageClient;
}): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const config = input.config ?? readGuestListSmsConfig();
  if (!config.configured) return { ok: false, error: config.message };
  const client = input.client ?? (twilio(config.accountSid, config.authToken) as unknown as TwilioMessageClient);
  const payload: Record<string, string> = { to: input.to, body: input.body };
  if (config.messagingServiceSid) payload.messagingServiceSid = config.messagingServiceSid;
  else if (config.fromNumber) payload.from = config.fromNumber;
  if (input.statusCallback) payload.statusCallback = input.statusCallback;
  const result = await sendTwilioMessage(client, payload);
  if (!result.ok) return result;
  return { ok: true, sid: result.sid };
}

export function webhookUrlCandidates(requestUrl: string, headers: Headers): string[] {
  const url = new URL(requestUrl);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host")?.trim();
  const candidates = [`${url.origin}${url.pathname}`];
  if (proto && host) candidates.unshift(`${proto}://${host}${url.pathname}`);
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}
