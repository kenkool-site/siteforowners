import { NextRequest, NextResponse } from "next/server";
import {
  clearOwnerSessionCookie,
  isSameOrigin,
} from "@/lib/invitations/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  clearOwnerSessionCookie(response);
  return response;
}
