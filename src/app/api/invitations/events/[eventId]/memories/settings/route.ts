import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { updateEventMemoriesSettings } from "@/lib/invitations/memories/repository";

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const values = body as { action?: string; enabled?: boolean; mode?: string };
    if (values.action === "set_enabled" && typeof values.enabled === "boolean") {
      await updateEventMemoriesSettings(params.eventId, { memoriesEnabled: values.enabled });
      return NextResponse.json({ ok: true });
    }
    if (values.action === "set_mode" && (values.mode === "auto_publish" || values.mode === "review_required")) {
      await updateEventMemoriesSettings(params.eventId, { memoriesMode: values.mode });
      return NextResponse.json({ ok: true });
    }
    if (values.action === "set_find_me_enabled" && typeof values.enabled === "boolean") {
      await updateEventMemoriesSettings(params.eventId, { findMeEnabled: values.enabled });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[memories/settings] update failed", { error });
    return NextResponse.json({ error: "settings update failed" }, { status: 500 });
  }
}
