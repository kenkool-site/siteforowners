import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { resolveHighlightGenerationRequest } from "./generate-request";

// Queues a forced highlight generation (or reports the already-pending one)
// for the host's Generate/Regenerate control. See generate-request.ts for the
// actual decision logic.
export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await resolveHighlightGenerationRequest(params.eventId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[memories/highlights/generate] failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "failed to queue highlight generation" }, { status: 500 });
  }
}
