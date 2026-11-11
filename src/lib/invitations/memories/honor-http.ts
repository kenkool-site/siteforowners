import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";

// Host-only gate. A memories guest session cookie is not an invitation owner
// session and cannot pass requireInvitationAccess, so guests cannot set or
// change guests of honor.
export async function honorHostGuard(request: NextRequest, eventId: string, mutate: boolean): Promise<NextResponse | null> {
  if (mutate && !isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export function honorErrorResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.name === "HonorValidation") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.name === "HonorNoFaces") {
    return NextResponse.json({ error: "no_faces" }, { status: 422 });
  }
  if (error instanceof Error && (error.message === "photo not found" || error.message.startsWith("photo must be"))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[guests-of-honor] request failed", { error });
  return NextResponse.json({ error: "guests of honor failed" }, { status: 500 });
}
