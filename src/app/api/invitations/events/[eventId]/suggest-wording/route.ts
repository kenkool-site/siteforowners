export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { reserveInvitationAnalysisAttempt } from "@/lib/invitations/analysis-repository";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";
import { buildInvitationWordingInput, suggestInvitationWording } from "@/lib/invitations/wording";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  try {
    if (!await reserveInvitationAnalysisAttempt(params.eventId)) {
      return NextResponse.json({ error: "wording_rate_limited" }, { status: 429 });
    }
    const wording = await suggestInvitationWording(buildInvitationWordingInput(event as unknown as Record<string, unknown>));
    return NextResponse.json({ wording }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[invitations/wording] failed", { eventId: params.eventId, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "wording_unavailable" }, { status: 502 });
  }
}
