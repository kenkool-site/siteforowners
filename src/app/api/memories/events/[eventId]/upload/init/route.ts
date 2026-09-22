import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { createMemoriesUploadTicket } from "@/lib/invitations/memories/upload-tickets";
import {
  countMemoryMediaForEvent,
  createPendingMemoryMedia,
  getEventMemoriesSettings,
  markMemoryMediaUploaded,
  simulateFixtureMediaReady,
} from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import { isUploadWindowOpen } from "@/lib/invitations/memories/upload-window";
import type { MediaKind } from "@/lib/invitations/memories/types";
// Imported from ./e2e-guard, not ./e2e-fixtures: e2e-fixtures.ts begins with
// `import "server-only"` (and pulls in the whole fixture/Supabase graph), which
// makes this route module unloadable under `tsx --test`. e2e-guard.ts is the
// dependency-free canonical implementation that e2e-fixtures.ts itself re-exports,
// and is what access.ts and broadcasts.ts import directly.
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-guard";

// Photo only for now. Nothing in the current pipeline can move a video off
// moderation_status='pending' — video moderation was designed around a
// client-captured poster frame that does not exist in this codebase — so
// accepting video uploads would mean shipping unmoderated media. A later plan
// lifts this restriction once real video moderation exists.
const ALLOWED_KINDS: MediaKind[] = ["photo"];
// Must stay in sync with SUPPORTED_IMAGE_EXTENSIONS in
// workers/memories-processing/src/index.ts (jpg, jpeg, png, webp, gif) — anything
// the Worker's photon build can't decode is rejected here, at upload time, rather
// than failing 5x and surfacing in the DLQ up to 30 minutes later. HEIC (the
// iPhone default) is deliberately unsupported for now.
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — matches this module's existing video cap in direct-media.ts
const MAX_MEDIA_PER_EVENT = 2000;

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const { eventId } = params;
    const parsedBody = body as { mediaKind?: string; contentType?: string; sizeBytes?: number };

    if (parsedBody.mediaKind === "video") {
      return NextResponse.json({ error: "video uploads are not yet supported" }, { status: 400 });
    }
    if (!ALLOWED_KINDS.includes(parsedBody.mediaKind as MediaKind)) {
      return NextResponse.json({ error: "invalid mediaKind" }, { status: 400 });
    }
    const contentType = parsedBody.contentType?.split(";")[0].trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "unsupported file type — upload a JPEG, PNG, WebP, or GIF image" },
        { status: 400 },
      );
    }
    if (typeof parsedBody.sizeBytes !== "number" || parsedBody.sizeBytes <= 0 || parsedBody.sizeBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "invalid or oversized file" }, { status: 400 });
    }

    const settings = await getEventMemoriesSettings(eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }
    if (!isUploadWindowOpen(settings.startsAt)) {
      return NextResponse.json({ error: "the upload window for this event has closed" }, { status: 404 });
    }

    const mediaCount = await countMemoryMediaForEvent(eventId);
    if (mediaCount >= MAX_MEDIA_PER_EVENT) {
      return NextResponse.json({ error: "upload quota exceeded for this event" }, { status: 429 });
    }

    const sessionToken = request.cookies.get("memories_guest_session")?.value;
    const session = sessionToken ? verifyMemoriesGuestSession(sessionToken, eventId) : null;

    const mediaId = randomUUID();
    const mediaKind = parsedBody.mediaKind as MediaKind;
    // Pass the validated content type so the object key carries the guest's real
    // format — the Worker dispatches on that extension.
    const { ticket, objectKey } = createMemoriesUploadTicket(eventId, mediaId, mediaKind, contentType);

    await createPendingMemoryMedia({
      id: mediaId,
      eventId,
      mediaKind,
      objectKeyOriginal: objectKey,
      guestSessionLevel: session?.level ?? "anonymous",
      uploaderRsvpId: session?.rsvpId ?? null,
      uploaderDisplayName: session?.guestName ?? null,
    });

    if (isInvitationE2EFixturesEnabled()) {
      // Fixture mode: never touch real R2. Simulate an already-uploaded,
      // already-processed, already-approved row so Playwright can exercise the
      // gallery immediately, matching the RSVP/broadcast E2E fixture convention.
      await markMemoryMediaUploaded(mediaId);
      await simulateFixtureMediaReady(mediaId);
      return NextResponse.json({ mediaId, ticket, uploadUrl: `https://fixture.local/${objectKey}` });
    }

    const storage = new R2StorageProvider();
    const uploadUrl = await storage.createPresignedUploadUrl(objectKey, contentType, 15 * 60, parsedBody.sizeBytes);

    return NextResponse.json({ mediaId, ticket, uploadUrl });
  } catch (error) {
    console.error("[memories/upload/init] submission failed", { error });
    return NextResponse.json({ error: "upload initialization failed" }, { status: 500 });
  }
}
