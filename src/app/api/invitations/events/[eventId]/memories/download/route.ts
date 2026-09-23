import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { mediaIds?: unknown };
    if (body.mediaIds !== undefined && (!Array.isArray(body.mediaIds) || body.mediaIds.length > 250 || !body.mediaIds.every((id) => typeof id === "string"))) return NextResponse.json({ error: "invalid mediaIds" }, { status: 400 });
    const client = createAdminClient();
    let query = client.from("memory_media").select("id,object_key_original").eq("event_id", params.eventId).eq("upload_status", "uploaded").limit(250);
    if (Array.isArray(body.mediaIds) && body.mediaIds.length) query = query.in("id", body.mediaIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const storage = new R2StorageProvider();
    const downloads = await Promise.all((data ?? []).map(async (row) => ({ mediaId: row.id as string, fileName: (row.object_key_original as string).split("/").pop() ?? `${row.id}.jpg`, url: await storage.getSignedDownloadUrl(row.object_key_original as string, 10 * 60) })));
    return NextResponse.json({ downloads });
  } catch (error) {
    console.error("[memories/download] failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "download preparation failed" }, { status: 500 });
  }
}
