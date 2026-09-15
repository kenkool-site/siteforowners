import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import { PublicInvitation } from "@/components/invitations/PublicInvitation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import { resolveInvitationPreview } from "@/lib/invitations/public-access";
import { getInvitationEventForManagement, getPublicInvitationBySlug } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false } };

export default async function InvitationPreviewPage({ params }: { params: { eventId: string } }) {
  const request = new NextRequest("http://localhost/invitations/preview", { headers: { cookie: cookies().toString() } });
  const preview = await resolveInvitationPreview(params.eventId, {
    authorize: async (eventId) => Boolean(await requireInvitationAccess(request, eventId)),
    find: async (eventId) => {
      const event = await getInvitationEventForManagement(eventId);
      return event ? getPublicInvitationBySlug(event.slug) : null;
    },
    loadMedia: getInvitationMediaForManagement,
  });
  if (!preview) notFound();
  return <InvitationPublicProvider locale={preview.event.locale} timeZone={preview.event.timezone}>
    <PublicInvitation event={preview.event} state={preview.state} media={preview.media} rsvpSummary={preview.rsvpSummary} preview />
  </InvitationPublicProvider>;
}
