import { cleanupInvitationMedia } from "@/lib/invitations/media-cleanup";
import { INVITATION_MEDIA_BUCKET } from "@/lib/invitations/media";
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
    const result = await cleanupInvitationMedia({
      listObjects: async () => listInvitationObjects(client),
      loadReferenceSnapshot: async () => {
        const { data, error } = await client.rpc("get_invitation_media_reference_snapshot");
        if (error) throw new Error("Unable to load invitation media reference snapshot", { cause: error });
        return data;
      },
      removeObject: async (path) => {
        const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).remove([path]);
        if (error) {
          console.error("[cron/invitation-media-cleanup] removal failed", { path, error });
          throw new Error("Unable to remove invitation media", { cause: error });
        }
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/invitation-media-cleanup] failed", { error });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
