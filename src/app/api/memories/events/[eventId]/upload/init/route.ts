import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { createMemoriesUploadTicket, objectKeyForOriginal, objectKeyForVideoPoster } from "@/lib/invitations/memories/upload-tickets";
import {
  countMemoryMediaForEvent,
  createPendingMemoryMedia,
  getEventMemoriesSettings,
  getEventVideoMinutesCap,
  guestHasUploadedLongClip,
  markMemoryMediaUploaded,
  simulateFixtureMediaReady,
  sumUploadedVideoSecondsForEvent,
} from "@/lib/invitations/memories/repository";
import { isStreamConfigured } from "@/lib/invitations/memories/stream";
import {
  checkVideoLimits,
  eventVideoMinutesCap,
  isLongClip,
  longestAllowedVideoSeconds,
  maxVideoBytes,
  MULTIPART_PART_BYTES,
  multipartPartCount,
  usesMultipartUpload,
  VIDEO_DURATION_GRACE_SECONDS,
} from "@/lib/invitations/memories/video-limits";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import { isUploadWindowOpen } from "@/lib/invitations/memories/upload-window";
import type { MediaKind } from "@/lib/invitations/memories/types";
// Imported from ./e2e-guard, not ./e2e-fixtures: e2e-fixtures.ts begins with
// `import "server-only"` (and pulls in the whole fixture/Supabase graph), which
// makes this route module unloadable under `tsx --test`. e2e-guard.ts is the
// dependency-free canonical implementation that e2e-fixtures.ts itself re-exports,
// and is what access.ts and broadcasts.ts import directly.
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-guard";

// Video: 60s/200MB cap, plus one long clip per guest of up to 5 minutes/1GB
// once Cloudflare Stream is set up (see video-limits.ts; client-checked
// duration, maxVideoBytes covers size),
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
// 200MB — the original 50MB (copied from direct-media.ts's unrelated host-asset
// cover-video cap) rejected essentially every real 60-second phone clip before
// any upload even began: a typical iPhone 1080p recording alone runs
// 60-130MB/minute, well past 50MB. 200MB comfortably covers 1080p and most
// 4K/30fps clips at the 60s duration cap.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_MEDIA_PER_EVENT = 2000;
// A piece of a big video can wait while earlier pieces retry on a weak signal.
const MULTIPART_PART_URL_SECONDS = 3 * 60 * 60;

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
    const parsedBody = body as { mediaKind?: string; contentType?: string; sizeBytes?: number; durationSeconds?: number };

    if (!ALLOWED_KINDS.includes(parsedBody.mediaKind as MediaKind)) {
      return NextResponse.json({ error: "invalid mediaKind" }, { status: 400 });
    }
    const contentType = parsedBody.contentType?.split(";")[0].trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        {
          error: "unsupported file type — upload a JPEG, PNG, WebP, or GIF image, or an MP4, WebM, or MOV video",
          code: "unsupported_type",
        },
        { status: 400 },
      );
    }
    const reportedDuration =
      parsedBody.mediaKind === "video" && typeof parsedBody.durationSeconds === "number" && Number.isFinite(parsedBody.durationSeconds) && parsedBody.durationSeconds >= 0
        ? parsedBody.durationSeconds
        : null;
    const maxBytes = parsedBody.mediaKind === "video" ? maxVideoBytes(reportedDuration) : MAX_UPLOAD_BYTES;
    if (typeof parsedBody.sizeBytes !== "number" || parsedBody.sizeBytes <= 0 || parsedBody.sizeBytes > maxBytes) {
      return NextResponse.json({ error: "invalid or oversized file", code: "too_large" }, { status: 400 });
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
    const streamConfigured = isStreamConfigured();

    if (mediaKind === "video") {
      const guest = { sessionId: session?.sessionId ?? null, rsvpId: session?.rsvpId ?? null };
      const [guestHasLongClip, eventVideoSecondsUsed, eventCap] = await Promise.all([
        isLongClip(reportedDuration) ? guestHasUploadedLongClip(eventId, guest) : Promise.resolve(false),
        sumUploadedVideoSecondsForEvent(eventId),
        getEventVideoMinutesCap(eventId),
      ]);
      const limit = checkVideoLimits({
        durationSeconds: reportedDuration,
        streamConfigured,
        guestHasLongClip,
        guestIdentified: Boolean(guest.sessionId || guest.rsvpId),
        eventVideoSecondsUsed,
        eventVideoMinutesCap: eventVideoMinutesCap(eventCap, process.env.MEMORIES_VIDEO_MINUTES_PER_EVENT),
      });
      if (limit === "video_minutes_full") {
        return NextResponse.json({ error: "this event has no room left for more video", code: limit }, { status: 429 });
      }
      if (limit) {
        return NextResponse.json({ error: "video is too long", code: limit }, { status: 400 });
      }
    }

    // Pass the validated content type so the object key carries the guest's real
    // format — the Worker dispatches on that extension.
    const multipart = !isInvitationE2EFixturesEnabled() && usesMultipartUpload(mediaKind, parsedBody.sizeBytes);
    const storage = isInvitationE2EFixturesEnabled() ? null : new R2StorageProvider();
    const multipartUpload =
      multipart && storage
        ? {
            uploadId: await storage.createMultipartUpload(objectKeyForOriginal(eventId, mediaId, mediaKind, contentType), contentType),
            partCount: multipartPartCount(parsedBody.sizeBytes),
          }
        : undefined;
    const { ticket, objectKey } = createMemoriesUploadTicket(eventId, mediaId, mediaKind, contentType, undefined, multipartUpload);

    await createPendingMemoryMedia({
      id: mediaId,
      eventId,
      mediaKind,
      objectKeyOriginal: objectKey,
      guestSessionLevel: session?.level ?? "anonymous",
      uploaderRsvpId: session?.rsvpId ?? null,
      uploaderSessionId: session?.sessionId ?? null,
      uploaderDisplayName: session?.guestName ?? null,
      durationSeconds: reportedDuration !== null && reportedDuration <= longestAllowedVideoSeconds(streamConfigured) + VIDEO_DURATION_GRACE_SECONDS
        ? reportedDuration
        : null,
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

    if (!storage) throw new Error("storage unavailable");
    const upload = multipartUpload
      ? {
          multipart: {
            partSizeBytes: MULTIPART_PART_BYTES,
            partUrls: await storage.createPresignedPartUrls(objectKey, multipartUpload.uploadId, multipartUpload.partCount, MULTIPART_PART_URL_SECONDS),
          },
        }
      : { uploadUrl: await storage.createPresignedUploadUrl(objectKey, contentType, 15 * 60, parsedBody.sizeBytes) };
    // Video is moderated via a client-captured poster frame (see the
    // ALLOWED_KINDS comment above) — issue a second presigned PUT so the guest
    // client can upload that frame as a plain JPEG alongside the video itself.
    //
    // Deliberately NOT passing a contentLength here (unlike the main upload
    // above, which passes the client-reported real file size): the poster
    // doesn't exist yet at this point — it's captured client-side, after this
    // response — so there is no real size to sign. A presigned S3/R2 PUT URL's
    // Content-Length becomes part of its signature (confirmed by tracing
    // @smithy/signature-v4: content-length isn't in ALWAYS_UNSIGNABLE_HEADERS
    // or excluded elsewhere in this codebase's usage), so signing a guessed
    // cap here made R2 reject the real poster PUT with a signature mismatch
    // whenever its actual size didn't exactly equal the guess — which is
    // essentially always. The size cap is enforced post-hoc instead, in
    // upload/complete, once the real uploaded object's size is known.
    const posterUploadUrl =
      mediaKind === "video"
        ? await storage.createPresignedUploadUrl(objectKeyForVideoPoster(eventId, mediaId), "image/jpeg", 15 * 60)
        : undefined;

    return NextResponse.json({ mediaId, ticket, ...upload, ...(posterUploadUrl ? { posterUploadUrl } : {}) });
  } catch (error) {
    console.error("[memories/upload/init] submission failed", { error });
    return NextResponse.json({ error: "upload initialization failed" }, { status: 500 });
  }
}
