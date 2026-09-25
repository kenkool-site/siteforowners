import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesUploadTicket, objectKeyForVideoPoster } from "@/lib/invitations/memories/upload-tickets";
import { getMemoryMediaById, markMemoryMediaUploaded, markVideoMemoryMediaReady } from "@/lib/invitations/memories/repository";
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
    if (!verifyMemoriesUploadTicket(parsedBody.ticket, eventId, parsedBody.mediaId)) {
      return NextResponse.json({ error: "invalid ticket" }, { status: 403 });
    }

    const media = await getMemoryMediaById(parsedBody.mediaId);
    if (!media) {
      return NextResponse.json({ error: "media not found" }, { status: 404 });
    }

    if (media.mediaKind === "video") {
      // Video is moderated via a client-captured poster frame (see upload/init) —
      // completion must not flip upload_status/processing_status to a ready state
      // until that poster actually landed in R2, otherwise the gallery/moderation
      // queue would show a video with no thumbnail to review.
      const posterKey = objectKeyForVideoPoster(eventId, parsedBody.mediaId);
      const storage = new R2StorageProvider();
      const posterExists = await storage.objectExists(posterKey);
      if (!posterExists) {
        return NextResponse.json({ error: "poster upload not found" }, { status: 409 });
      }
      await markVideoMemoryMediaReady(parsedBody.mediaId, media.objectKeyOriginal, posterKey);

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
