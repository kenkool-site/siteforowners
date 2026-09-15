export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";
import { readInvitationReferenceBytes } from "@/lib/invitations/media";
import { analyzeInvitationReference, INVITATION_ANALYSIS_SCHEMA_VERSION } from "@/lib/invitations/reference-analyzer";
import { reserveInvitationAnalysisAttempt, saveInvitationReferenceAnalysis } from "@/lib/invitations/analysis-repository";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (!event.designedInvitePath) return NextResponse.json({ error: "reference_required" }, { status: 409 });
  if (event.referenceAnalysis?.referencePath === event.designedInvitePath && event.referenceAnalysis.schemaVersion === INVITATION_ANALYSIS_SCHEMA_VERSION) {
    return NextResponse.json({ analysis: event.referenceAnalysis, reused: true }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    if (!await reserveInvitationAnalysisAttempt(params.eventId)) return NextResponse.json({ error: "analysis_rate_limited" }, { status: 429 });
    const image = await readInvitationReferenceBytes(event.designedInvitePath, params.eventId);
    const analysis = await analyzeInvitationReference({ ...image, referencePath: event.designedInvitePath });
    await saveInvitationReferenceAnalysis(params.eventId, analysis);
    return NextResponse.json({ analysis, reused: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[invitations/reference-analysis] failed", { eventId: params.eventId, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "analysis_unavailable" }, { status: 502 });
  }
}
