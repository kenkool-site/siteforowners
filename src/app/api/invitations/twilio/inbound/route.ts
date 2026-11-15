import { NextRequest, NextResponse } from "next/server";
import { twilioSignatureMatches } from "@/lib/invitations/guest-list";
import { readTwilioParams } from "@/lib/invitations/guest-list-http";
import { handleTwilioInbound } from "@/lib/invitations/guest-list-service";
import { webhookUrlCandidates } from "@/lib/invitations/guest-list-sms";

const EMPTY_TWIML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  if (!authToken) return new NextResponse("Twilio is not configured", { status: 503 });
  const params = await readTwilioParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const valid = Boolean(signature) && webhookUrlCandidates(request.url, request.headers).some((url) => (
    twilioSignatureMatches(authToken, signature ?? "", url, params)
  ));
  if (!valid) return new NextResponse("Invalid signature", { status: 403 });
  try {
    await handleTwilioInbound(params);
  } catch (error) {
    console.error("[guest-list] inbound webhook failed", { error });
  }
  return new NextResponse(EMPTY_TWIML, { headers: { "content-type": "text/xml" } });
}
