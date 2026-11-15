import { NextRequest, NextResponse } from "next/server";
import { getClientIp, hashIp } from "@/lib/api-rate-limit";
import { isSameOrigin } from "@/lib/invitations/auth";
import { guestListErrorResponse } from "@/lib/invitations/guest-list-http";
import { checkGuestVerification, requestGuestVerification } from "@/lib/invitations/guest-list-service";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  let body: { slug?: unknown; phone?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_phone" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const code = typeof body.code === "string" ? body.code : "";
  const ipHash = hashIp(getClientIp(request.headers));
  try {
    const result = code
      ? await checkGuestVerification({ slug, phone, code, ipHash })
      : await requestGuestVerification({ slug, phone, ipHash });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] verification failed");
  }
}
