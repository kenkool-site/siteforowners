import { NextRequest, NextResponse } from "next/server";
import {
  getInvitationPasscodeCookieName,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";
import { getInvitationMediaForManagement, type InvitationMediaSnapshot } from "@/lib/invitations/media";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirrors the gallery row shape getInvitationMediaForManagement's own
// listGallery dependency already queries (src/lib/invitations/media.ts) -
// id/alt_text/sort_order only, no storage_path, since the public case never
// signs anything: the gallery proxy route (Task 2) looks the path up itself
// by id when called.
async function publicGalleryItems(eventId: string): Promise<{ id: string; altText: string; sortOrder: number }[]> {
  const { data, error } = await createAdminClient()
    .from("invitation_media")
    .select("id,alt_text,sort_order")
    .eq("event_id", eventId)
    .eq("kind", "gallery_image")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as Array<{ id: string; alt_text: string; sort_order: number }>).map((row) => ({
    id: row.id,
    altText: row.alt_text,
    sortOrder: row.sort_order,
  }));
}

async function publicMediaSnapshot(event: {
  id: string;
  slug: string;
  coverImagePath: string | null;
  videoPath: string | null;
}): Promise<InvitationMediaSnapshot> {
  const base = `/api/invitations/public/${encodeURIComponent(event.slug)}`;
  const gallery = await publicGalleryItems(event.id);
  return {
    designedInvite: null,
    cover: event.coverImagePath ? { kind: "cover", path: event.coverImagePath, url: `${base}/cover` } : null,
    video: event.videoPath ? { kind: "video", path: event.videoPath, url: `${base}/video` } : null,
    gallery: gallery.map((item) => ({
      id: item.id,
      kind: "gallery",
      path: "",
      url: `${base}/gallery/${encodeURIComponent(item.id)}`,
      altText: item.altText,
      sortOrder: item.sortOrder,
    })),
  };
}

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });

  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") {
    return NextResponse.json({ error: "Invitation unavailable" }, { status: 404 });
  }

  if (invitation.passcodeHash) {
    const signed = request.cookies.get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    let hasAccess = false;
    try {
      hasAccess = Boolean(signed && (await verifyInvitationPasscodeSession(signed, invitation.event.id)));
    } catch {
      hasAccess = false;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: "Invitation unavailable" }, { status: 403 });
    }
    const media = await getInvitationMediaForManagement(invitation.event);
    return NextResponse.json(media);
  }

  const media = await publicMediaSnapshot(invitation.event);
  return NextResponse.json(media);
}
