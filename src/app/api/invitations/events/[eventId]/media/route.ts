import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import {
  buildInvitationMediaPath,
  createInvitationMediaSnapshot,
  finalizeInvitationMediaUpload,
  getSignedInvitationMedia,
  INVITATION_MEDIA_BUCKET,
  isInvitationMediaPathForEvent,
  removeInvitationSingletonMedia,
  validateInvitationMedia,
  type InvitationMediaKind,
  type InvitationMediaSnapshot,
} from "@/lib/invitations/media";
import {
  getInvitationEventForManagement,
  invitationRepository,
} from "@/lib/invitations/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-fixtures";
import { NextRequest, NextResponse } from "next/server";

type AdminClient = ReturnType<typeof createAdminClient>;

type GalleryRow = {
  id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
};

class InvitationGalleryFullError extends Error {}

const EVENT_PATH_FIELD = {
  designed_invite: "designed_invite_path",
  cover: "cover_image_path",
  video: "video_path",
} as const;

function parseKind(value: FormDataEntryValue | null): InvitationMediaKind | null {
  return value === "designed_invite" || value === "cover" || value === "gallery" || value === "video"
    ? value
    : null;
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return typeof value !== "string"
    && value !== null
    && typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.arrayBuffer === "function";
}

function eventPath(
  event: { designedInvitePath: string | null; coverImagePath: string | null; videoPath: string | null },
  kind: Exclude<InvitationMediaKind, "gallery">,
): string | null {
  if (kind === "designed_invite") return event.designedInvitePath;
  if (kind === "cover") return event.coverImagePath;
  return event.videoPath;
}

async function listGallery(client: AdminClient, eventId: string): Promise<GalleryRow[]> {
  const { data, error } = await client
    .from("invitation_media")
    .select("id,storage_path,alt_text,sort_order")
    .eq("event_id", eventId)
    .eq("kind", "gallery_image")
    .order("sort_order", { ascending: true });
  if (error) throw new Error("Unable to load invitation gallery", { cause: error });
  return (data ?? []) as unknown as GalleryRow[];
}

async function loadMediaSnapshot(
  client: AdminClient,
  event: {
    id: string;
    designedInvitePath: string | null;
    coverImagePath: string | null;
    videoPath: string | null;
  },
): Promise<InvitationMediaSnapshot> {
  return createInvitationMediaSnapshot(event, {
    listGallery: async (eventId) => (await listGallery(client, eventId)).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      altText: row.alt_text,
      sortOrder: row.sort_order,
    })),
    sign: async (path) => getSignedInvitationMedia(path, {
      createSignedUrl: async (storagePath, expiresIn) => {
        const { data, error } = await client.storage
          .from(INVITATION_MEDIA_BUCKET)
          .createSignedUrl(storagePath, expiresIn);
        if (error || !data?.signedUrl) throw new Error("Unable to sign invitation media", { cause: error });
        return data.signedUrl;
      },
    }),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  try {
    const media = await loadMediaSnapshot(createAdminClient(), event);
    return NextResponse.json({ media });
  } catch (error) {
    console.error("[invitations/media] read failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Invitation media could not be loaded" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getInvitationEventForManagement(params.eventId);
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (isInvitationE2EFixturesEnabled()) {
    return NextResponse.json({ error: "Fixture media mutations are unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ errors: { media: "invalid_form" } }, { status: 400 });
  }
  const kind = parseKind(form.get("kind"));
  const file = form.get("file");
  if (!kind || !isUpload(file)) {
    return NextResponse.json({ errors: { media: "invalid_media_type" } }, { status: 400 });
  }

  const altTextValue = form.get("altText");
  const altText = typeof altTextValue === "string" ? altTextValue.trim() : "";
  const mediaIdValue = form.get("mediaId");
  const mediaId = typeof mediaIdValue === "string" && mediaIdValue ? mediaIdValue : null;
  if (kind === "gallery" && !altText) {
    return NextResponse.json({ errors: { media: "gallery_alt_required" } }, { status: 400 });
  }

  const client = createAdminClient();
  let replacedGalleryRow: GalleryRow | null = null;
  try {
    if (kind === "gallery" && mediaId) {
      replacedGalleryRow = (await listGallery(client, params.eventId)).find((row) => row.id === mediaId) ?? null;
      if (!replacedGalleryRow) {
        return NextResponse.json({ errors: { media: "invalid_media_reference" } }, { status: 404 });
      }
    }
    const validation = await validateInvitationMedia(file, kind);
    if (!validation.ok) {
      return NextResponse.json({ errors: { media: validation.code } }, { status: 400 });
    }

    const newPath = buildInvitationMediaPath(params.eventId, kind, validation.extension);
    const oldPath = kind === "gallery" ? replacedGalleryRow?.storage_path ?? null : eventPath(current, kind);
    await finalizeInvitationMediaUpload({
      newPath,
      oldPath,
      upload: async (path) => {
        const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).upload(path, validation.bytes, {
          contentType: validation.contentType,
          upsert: false,
        });
        if (error) throw new Error("Unable to upload invitation media", { cause: error });
      },
      finalize: async () => {
        if (kind === "gallery") {
          if (replacedGalleryRow) {
            const { data, error } = await client
              .from("invitation_media")
              .update({
                storage_path: newPath,
                alt_text: altText,
                updated_at: new Date().toISOString(),
              })
              .eq("id", replacedGalleryRow.id)
              .eq("event_id", params.eventId)
              .eq("storage_path", replacedGalleryRow.storage_path)
              .select("id")
              .maybeSingle();
            if (error || !data) throw new Error("Unable to replace invitation gallery image", { cause: error });
            return;
          }
          const { error } = await client.rpc("insert_invitation_gallery_media", {
            p_event_id: params.eventId,
            p_storage_path: newPath,
            p_alt_text: altText,
          });
          if (error?.message.includes("invitation_gallery_full")) throw new InvitationGalleryFullError();
          if (error) throw new Error("Unable to save invitation gallery image", { cause: error });
          return;
        }
        await invitationRepository.updateEvent(params.eventId, {
          [EVENT_PATH_FIELD[kind]]: newPath,
          updated_at: new Date().toISOString(),
        });
      },
      remove: async (path) => {
        const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).remove([path]);
        if (error) throw new Error("Unable to remove invitation media", { cause: error });
      },
    });

    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) throw new Error("Invitation disappeared after media update");
    return NextResponse.json({ event, media: await loadMediaSnapshot(client, event) });
  } catch (error) {
    console.error("[invitations/media] upload failed", { eventId: params.eventId, kind, error });
    if (error instanceof InvitationGalleryFullError) {
      return NextResponse.json({ errors: { media: "gallery_full" } }, { status: 409 });
    }
    return NextResponse.json({ errors: { media: "upload_failed" } }, { status: 500 });
  }
}

type DeleteBody = { kind?: unknown; id?: unknown; path?: unknown };

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getInvitationEventForManagement(params.eventId);
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (isInvitationE2EFixturesEnabled()) {
    return NextResponse.json({ error: "Fixture media mutations are unavailable" }, { status: 503 });
  }

  let body: DeleteBody;
  try {
    body = await request.json() as DeleteBody;
  } catch {
    return NextResponse.json({ errors: { media: "invalid_form" } }, { status: 400 });
  }
  const kind = typeof body.kind === "string" ? parseKind(body.kind) : null;
  const requestedPath = typeof body.path === "string" ? body.path : "";
  if (!kind || !requestedPath || !isInvitationMediaPathForEvent(requestedPath, params.eventId, kind)) {
    return NextResponse.json({ errors: { media: "invalid_media_reference" } }, { status: 400 });
  }

  const client = createAdminClient();
  try {
    if (kind === "gallery") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ errors: { media: "invalid_media_reference" } }, { status: 400 });
      }
      const { data, error } = await client
        .from("invitation_media")
        .select("id,storage_path")
        .eq("id", body.id)
        .eq("event_id", params.eventId)
        .eq("kind", "gallery_image")
        .maybeSingle();
      const row = data as unknown as { id: string; storage_path: string } | null;
      if (error) throw new Error("Unable to verify invitation gallery image", { cause: error });
      if (!row || row.storage_path !== requestedPath) {
        return NextResponse.json({ errors: { media: "invalid_media_reference" } }, { status: 404 });
      }
      const { error: deleteError } = await client
        .from("invitation_media")
        .delete()
        .eq("id", row.id)
        .eq("event_id", params.eventId)
        .eq("storage_path", requestedPath);
      if (deleteError) throw new Error("Unable to remove invitation gallery reference", { cause: deleteError });
    } else {
      const currentPath = eventPath(current, kind);
      if (currentPath !== requestedPath) {
        return NextResponse.json({ errors: { media: "invalid_media_reference" } }, { status: 404 });
      }
      const outcome = await removeInvitationSingletonMedia({
        eventId: params.eventId,
        kind,
        expectedPath: requestedPath,
        clearReference: async (eventId, clearKind, expectedPath) => {
          const field = EVENT_PATH_FIELD[clearKind];
          const { data, error } = await client
            .from("invitation_events")
            .update({ [field]: null, updated_at: new Date().toISOString() })
            .eq("id", eventId)
            .eq(field, expectedPath)
            .select("id")
            .maybeSingle();
          if (error) throw new Error("Unable to clear invitation media reference", { cause: error });
          return Boolean(data);
        },
        removeObject: async (path) => {
          const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).remove([path]);
          if (error) throw new Error("Unable to remove invitation media object", { cause: error });
        },
      });
      if (outcome === "conflict") {
        return NextResponse.json({ errors: { media: "media_changed" } }, { status: 409 });
      }
    }

    if (kind === "gallery") {
      const { error } = await client.storage.from(INVITATION_MEDIA_BUCKET).remove([requestedPath]);
      if (error) throw new Error("Unable to remove invitation media object", { cause: error });
    }
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) throw new Error("Invitation disappeared after media removal");
    return NextResponse.json({ event, media: await loadMediaSnapshot(client, event) });
  } catch (error) {
    console.error("[invitations/media] delete failed", { eventId: params.eventId, kind, error });
    return NextResponse.json({ errors: { media: "remove_failed" } }, { status: 500 });
  }
}
