import { NextRequest, NextResponse } from "next/server";
import { getGuestHighlightsForEvent } from "./guest-highlights";

// Framework-facing entry point only — a route.ts file may only export the
// recognized HTTP handlers and a small set of config fields, so the actual
// read-model logic (and its DI seam) lives in the sibling guest-highlights.ts.
export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const result = await getGuestHighlightsForEvent(params.eventId);
    if (!result) return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[memories/highlights] guest fetch failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "highlights fetch failed" }, { status: 500 });
  }
}
