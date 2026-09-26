import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { getFindMeDailyLimit, updateFindMeDailyLimit } from "@/lib/invitations/memories/repository";

const MAX_DAILY_LIMIT = 1000;

function hasFounderSession(request: NextRequest): boolean {
  return hasFounderInvitationSession(
    process.env.ADMIN_PASSWORD,
    request.cookies.get("admin_session")?.value,
  );
}

export async function GET(request: NextRequest) {
  if (!hasFounderSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dailySearchLimit = await getFindMeDailyLimit();
  return NextResponse.json({ dailySearchLimit });
}

export async function PATCH(request: NextRequest) {
  if (!hasFounderSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const dailySearchLimit = (body as { dailySearchLimit?: unknown })?.dailySearchLimit;
  if (typeof dailySearchLimit !== "number" || !Number.isInteger(dailySearchLimit) || dailySearchLimit < 1 || dailySearchLimit > MAX_DAILY_LIMIT) {
    return NextResponse.json({ error: `dailySearchLimit must be an integer between 1 and ${MAX_DAILY_LIMIT}` }, { status: 400 });
  }

  try {
    await updateFindMeDailyLimit(dailySearchLimit);
    return NextResponse.json({ ok: true, dailySearchLimit });
  } catch (error) {
    console.error("[invitations/admin/find-me-settings] update failed", { error });
    return NextResponse.json({ error: "Unable to update the Find Me search limit" }, { status: 500 });
  }
}
