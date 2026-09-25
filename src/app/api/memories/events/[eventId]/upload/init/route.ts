import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { createMemoriesUploadTicket, objectKeyForVideoPoster } from "@/lib/invitations/memories/upload-tickets";
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

// Video: 60s/50MB cap (client-checked duration, this constant covers size),
// moderated via a client-captured poster frame — see
// docs/superpowers/specs/2026-09-24-invitespot-memories-video-support-design.md.
// Video never enters the photon-rs processing Worker pipeline (no transcoding),
// so it isn't subject to that pipeline's own format support.
const ALLOWED_KINDS: MediaKind[] = ["photo", "video"];
// Must stay in sync with SUPPORTED_IMAGE_EXTENSIONS in
// workers/memories-processing/src/index.ts (jpg, jpeg, png, webp, gif) for the
// photo half — anything the Worker's photon build can't decode is rejected here,
// at upload time, rather than failing 5x and surfacing in the DLQ up to 30
// minutes later. HEIC (the iPhone default) is deliberately unsupported for now.
// Video types skip the Worker entirely, so they aren't constrained by it.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — matches this module's existing video cap in direct-media.ts
const MAX_MEDIA_PER_EVENT = 2000;
// Server-enforced ceiling for the poster JPEG's presigned upload. The client
// now caps the captured poster frame at 1600px on its longest side (see
// GuestUploadView.tsx's capturePosterFrame/MAX_POSTER_DIMENSION_PX), which
// should never produce more than a few hundred KB at reasonable JPEG
// quality — 2MB is generous headroom above that while still being a real,
// enforced limit, matching the main upload's own contentLength enforcement
// below.
const MAX_POSTER_UPLOAD_BYTES = 2 * 1024 * 1024;

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

    if (!ALLOWED_KINDS.includes(parsedBody.mediaKind as MediaKind)) {
      return NextResponse.json({ error: "invalid mediaKind" }, { status: 400 });
    }
    const contentType = parsedBody.contentType?.split(";")[0].trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "unsupported file type — upload a JPEG, PNG, WebP, or GIF image, or an MP4, WebM, or MOV video" },
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
      uploaderSessionId: session?.sessionId ?? null,
      uploaderDisplayName: session?.guestName ?? null,
    });

    if (isInvitationE2EFixturesEnabled()) {
      // Fixture mode: never touch real R2. Simulate an already-uploaded,
      // already-processed, already-approved row so Playwright can exercise the
      // gallery immediately, matching the RSVP/broadcast E2E fixture convention.
      // The poster URL is faked the same way as uploadUrl below, rather than
      // routed through R2StorageProvider — this branch must stay reachable in
      // dev/E2E environments that have no R2 credentials configured at all.
      await markMemoryMediaUploaded(mediaId);
      await simulateFixtureMediaReady(mediaId);
      const posterUploadUrl =
        mediaKind === "video" ? `https://fixture.local/${objectKeyForVideoPoster(eventId, mediaId)}` : undefined;
      return NextResponse.json({
        mediaId,
        ticket,
        uploadUrl: `https://fixture.local/${objectKey}`,
        ...(posterUploadUrl ? { posterUploadUrl } : {}),
      });
    }

    const storage = new R2StorageProvider();
    const uploadUrl = await storage.createPresignedUploadUrl(objectKey, contentType, 15 * 60, parsedBody.sizeBytes);
    // Video is moderated via a client-captured poster frame (see the
    // ALLOWED_KINDS comment above) — issue a second presigned PUT so the guest
    // client can upload that frame as a plain JPEG alongside the video itself.
    const posterUploadUrl =
      mediaKind === "video"
        ? await storage.createPresignedUploadUrl(
            objectKeyForVideoPoster(eventId, mediaId),
            "image/jpeg",
            15 * 60,
            MAX_POSTER_UPLOAD_BYTES,
          )
        : undefined;

    return NextResponse.json({ mediaId, ticket, uploadUrl, ...(posterUploadUrl ? { posterUploadUrl } : {}) });
  } catch (error) {
    console.error("[memories/upload/init] submission failed", { error });
    return NextResponse.json({ error: "upload initialization failed" }, { status: 500 });
  }
}
