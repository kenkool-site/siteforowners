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
import type { MediaKind } from "@/lib/invitations/memories/types";
// Import path/signature verified against the existing RSVP/broadcast E2E fixture
// layer (grepped `isInvitationE2EFixturesEnabled` usage across the repo): the
// canonical implementation lives in ./e2e-guard and is re-exported here from
// e2e-fixtures.ts, which is the same module every other invitation route
// (passcode, rsvp, media, auth/login, admin notifications retry) imports it
// from. Confirmed correct — no change needed from the brief's guess.
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-fixtures";

const ALLOWED_KINDS: MediaKind[] = ["photo", "video"];
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

    if (!ALLOWED_KINDS.includes(parsedBody.mediaKind as MediaKind)) {
      return NextResponse.json({ error: "invalid mediaKind" }, { status: 400 });
    }
    if (typeof parsedBody.sizeBytes !== "number" || parsedBody.sizeBytes <= 0 || parsedBody.sizeBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "invalid or oversized file" }, { status: 400 });
    }

    const settings = await getEventMemoriesSettings(eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }

    const mediaCount = await countMemoryMediaForEvent(eventId);
    if (mediaCount >= MAX_MEDIA_PER_EVENT) {
      return NextResponse.json({ error: "upload quota exceeded for this event" }, { status: 429 });
    }

    const sessionToken = request.cookies.get("memories_guest_session")?.value;
    const session = sessionToken ? verifyMemoriesGuestSession(sessionToken, eventId) : null;

    const mediaId = randomUUID();
    const mediaKind = parsedBody.mediaKind as MediaKind;
    const { ticket, objectKey } = createMemoriesUploadTicket(eventId, mediaId, mediaKind);

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
    const uploadUrl = await storage.createPresignedUploadUrl(
      objectKey,
      parsedBody.contentType ?? (mediaKind === "video" ? "video/mp4" : "image/jpeg"),
      15 * 60,
      parsedBody.sizeBytes,
    );

    return NextResponse.json({ mediaId, ticket, uploadUrl });
  } catch (error) {
    console.error("[memories/upload/init] submission failed", { error });
    return NextResponse.json({ error: "upload initialization failed" }, { status: 500 });
  }
}
