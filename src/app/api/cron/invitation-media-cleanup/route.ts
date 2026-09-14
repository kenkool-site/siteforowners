import { INVITATION_MEDIA_BUCKET, isInvitationMediaOrphan } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminClient = ReturnType<typeof createAdminClient>;
type ListedObject = {
  id: string | null;
  name: string;
  created_at: string | null;
};

async function listInvitationObjects(
  client: AdminClient,
  prefix = "",
): Promise<Array<{ path: string; createdAt: string }>> {
  const objects: Array<{ path: string; createdAt: string }> = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(INVITATION_MEDIA_BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Unable to list invitation media", { cause: error });
    const rows = (data ?? []) as unknown as ListedObject[];
    for (const row of rows) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id === null) {
        objects.push(...await listInvitationObjects(client, path));
      } else if (row.created_at) {
        objects.push({ path, createdAt: row.created_at });
      }
    }
    if (rows.length < pageSize) break;
  }
  return objects;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createAdminClient();
  try {
    const [objects, eventResult, galleryResult] = await Promise.all([
      listInvitationObjects(client),
      client.from("invitation_events").select("designed_invite_path,cover_image_path,video_path"),
      client.from("invitation_media").select("storage_path"),
    ]);
    if (eventResult.error) throw new Error("Unable to load event media references", { cause: eventResult.error });
    if (galleryResult.error) throw new Error("Unable to load gallery media references", { cause: galleryResult.error });

    const eventRows = (eventResult.data ?? []) as unknown as Array<{
      designed_invite_path: string | null;
      cover_image_path: string | null;
      video_path: string | null;
    }>;
    const galleryRows = (galleryResult.data ?? []) as unknown as Array<{ storage_path: string }>;
    const referenced = new Set<string>();
    for (const event of eventRows) {
      for (const path of [event.designed_invite_path, event.cover_image_path, event.video_path]) {
        if (path) referenced.add(path);
      }
    }
    for (const row of galleryRows) referenced.add(row.storage_path);

    const now = new Date();
    let deleted = 0;
    let failed = 0;
    for (const object of objects) {
      if (!isInvitationMediaOrphan({
        createdAt: object.createdAt,
        referenced: referenced.has(object.path),
      }, now)) continue;
      const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).remove([object.path]);
      if (error) {
        failed += 1;
        console.error("[cron/invitation-media-cleanup] removal failed", { path: object.path, error });
      } else {
        deleted += 1;
      }
    }
    return NextResponse.json({ scanned: objects.length, deleted, failed });
  } catch (error) {
    console.error("[cron/invitation-media-cleanup] failed", { error });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
