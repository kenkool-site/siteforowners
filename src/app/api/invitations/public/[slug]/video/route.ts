import { NextResponse } from "next/server";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { INVITATION_MEDIA_BUCKET, isInvitationMediaPathForEvent } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
};

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation || invitation.passcodeHash || getEffectiveEventState(invitation.event, new Date()) !== "published") {
    return new NextResponse(null, { status: 404 });
  }
  const path = invitation.event.videoPath;
  if (!path || !isInvitationMediaPathForEvent(path, invitation.event.id, "video")) {
    return new NextResponse(null, { status: 404 });
  }
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new NextResponse(null, { status: 404 });

  const { data, error } = await createAdminClient().storage.from(INVITATION_MEDIA_BUCKET).download(path);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
