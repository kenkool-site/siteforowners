import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { readMemoriesUploadTicket, objectKeyForVideoPoster, MAX_POSTER_UPLOAD_BYTES } from "@/lib/invitations/memories/upload-tickets";
import {
  getMemoryMediaById,
  guestHasUploadedLongClip,
  markMemoryMediaUploaded,
  markVideoMemoryMediaReady,
  updateMemoryMediaStream,
} from "@/lib/invitations/memories/repository";
import { copyVideoToStream, getStreamConfig } from "@/lib/invitations/memories/stream";
import { isLongClip } from "@/lib/invitations/memories/video-limits";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import { moderateMedia } from "@/app/api/memories/moderate/moderate-media";

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
    const parsedBody = body as { mediaId?: string; ticket?: string };

    if (!parsedBody.mediaId || !parsedBody.ticket) {
      return NextResponse.json({ error: "missing mediaId or ticket" }, { status: 400 });
    }
    const ticket = readMemoriesUploadTicket(parsedBody.ticket, eventId, parsedBody.mediaId);
    if (!ticket) {
      return NextResponse.json({ error: "invalid ticket" }, { status: 403 });
    }

    const media = await getMemoryMediaById(parsedBody.mediaId);
    if (!media) {
      return NextResponse.json({ error: "media not found" }, { status: 404 });
    }

    // A big video arrives in pieces; join them into the one original object.
    // A repeated /complete finds the object already joined and moves on.
    if (ticket.multipart) {
      const storage = new R2StorageProvider();
      if (!(await storage.objectExists(media.objectKeyOriginal))) {
        const joined = await storage.completeMultipartUpload(media.objectKeyOriginal, ticket.multipart.uploadId, ticket.multipart.partCount);
        if (!joined) {
          return NextResponse.json({ error: "upload incomplete" }, { status: 409 });
        }
      }
    }

    // Each guest gets one long clip. upload/init already checked, but two long
    // clips could have been uploading at once.
    if (media.mediaKind === "video" && isLongClip(media.durationSeconds)) {
      const alreadyHasOne = await guestHasUploadedLongClip(
        eventId,
        { sessionId: media.uploaderSessionId, rsvpId: media.uploaderRsvpId },
        media.id,
      );
      if (alreadyHasOne) {
        return NextResponse.json({ error: "video is too long", code: "long_clip_used" }, { status: 409 });
      }
    }

    if (media.mediaKind === "video") {
      // Video is moderated via a client-captured poster frame (see upload/init) —
      // completion must not flip upload_status/processing_status to a ready state
      // until that poster actually landed in R2, otherwise the gallery/moderation
      // queue would show a video with no thumbnail to review.
      const posterKey = objectKeyForVideoPoster(eventId, parsedBody.mediaId);
      const storage = new R2StorageProvider();
      // The poster's presigned upload URL can't sign an exact expected size
      // (see upload/init's own comment on that call) since the poster isn't
      // captured until after that URL is issued — so the size cap is
      // enforced here instead, against the real uploaded object.
      const posterSizeBytes = await storage.getObjectSizeBytes(posterKey);
      if (posterSizeBytes === null) {
        return NextResponse.json({ error: "poster upload not found" }, { status: 409 });
      }
      if (posterSizeBytes > MAX_POSTER_UPLOAD_BYTES) {
        return NextResponse.json({ error: "poster upload too large" }, { status: 400 });
      }
      await markVideoMemoryMediaReady(parsedBody.mediaId, media.objectKeyOriginal, posterKey);

      // Best effort, like moderation below: without a Stream copy the video
      // still plays from its R2 original.
      const streamConfig = getStreamConfig();
      if (streamConfig) {
        try {
          // Stream fetches the clip in the background, so give it a while.
          const sourceUrl = await storage.getSignedDownloadUrl(media.objectKeyOriginal, 6 * 60 * 60);
          const streamUid = await copyVideoToStream(streamConfig, { sourceUrl, name: `${eventId}/${media.id}` });
          await updateMemoryMediaStream(media.id, streamUid ? { streamUid, streamStatus: "copying" } : { streamStatus: "failed" });
        } catch (err) {
          console.error("[memories/upload/complete] failed to start the Stream copy (non-fatal)", { mediaId: media.id, error: err });
        }
      }

      // Video never reaches the Cloudflare Worker's own moderation trigger —
      // that Worker returns early for any unsupported (non-image) extension,
      // which is every video, before it ever fires its fire-and-forget POST
      // to /api/memories/moderate. So video's whole moderation lifecycle must
      // be triggered independently, right here, rather than depending on the
      // async image-processing Worker pipeline the way photos do (see
      // moderate-media.ts's own header comment for the full story). Best
      // effort: a moderation hiccup here must never turn this otherwise-
      // successful /complete response into a failure for the guest — matches
      // this codebase's established convention for non-critical follow-on
      // work (e.g. the highlight-generation queueing in
      // src/app/api/invitations/events/[eventId]/memories/moderation/route.ts).
      try {
        await moderateMedia(parsedBody.mediaId);
      } catch (err) {
        console.error("[memories/upload/complete] failed to trigger video moderation (non-fatal)", {
          mediaId: parsedBody.mediaId,
          error: err,
        });
      }
    } else {
      await markMemoryMediaUploaded(parsedBody.mediaId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories/upload/complete] submission failed", { error });
    return NextResponse.json({ error: "upload completion failed" }, { status: 500 });
  }
}
