import { NextRequest, NextResponse } from "next/server";
import { twilioSignatureMatches } from "@/lib/invitations/guest-list";
import { guestListErrorResponse, readTwilioParams } from "@/lib/invitations/guest-list-http";
import { handleTwilioStatus } from "@/lib/invitations/guest-list-service";
import { webhookUrlCandidates } from "@/lib/invitations/guest-list-sms";

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
    await handleTwilioStatus(params);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] status callback failed");
  }
}
