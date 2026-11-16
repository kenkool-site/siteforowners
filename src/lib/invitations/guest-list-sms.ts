import { getTwilioMessageClient, sendTwilioMessage, type TwilioMessageClient } from "@/lib/sms";

export type GuestListSmsStatus = {
  configured: boolean;
  message: string | null;
};

/** Same credentials as booking SMS and invitation notifications: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. */
export function guestListSmsStatus(env: NodeJS.ProcessEnv = process.env): GuestListSmsStatus {
  if (!env.TWILIO_ACCOUNT_SID?.trim() || !env.TWILIO_AUTH_TOKEN?.trim()) {
    return {
      configured: false,
      message: "Texting is turned off until TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set.",
    };
  }
  if (!env.TWILIO_FROM?.trim()) {
    return { configured: false, message: "Texting is turned off until TWILIO_FROM is set." };
  }
  return { configured: true, message: null };
}

export async function sendGuestListSms(input: {
  to: string;
  body: string;
  statusCallback?: string | null;
  client?: TwilioMessageClient | null;
}): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const status = guestListSmsStatus();
  const client = input.client === undefined ? getTwilioMessageClient() : input.client;
  const from = process.env.TWILIO_FROM?.trim();
  if (!client || !from) {
    return { ok: false, error: status.message ?? "SMS delivery is not configured" };
  }
  const payload: Record<string, string> = { from, to: input.to, body: input.body };
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
