import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventSiteFonts } from "@/components/invitations/EventSiteFonts";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { InvitationStateView, PublicInvitation } from "@/components/invitations/PublicInvitation";
import {
  invitationPageMetadata,
  resolvePublicInvitationPage,
  toPublicInvitationClientDetails,
} from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug, listPublicInvitationComments } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    return invitationPageMetadata(invitation, state);
  } catch {
    return invitationPageMetadata(null, null);
  }
}

export default async function PublicInvitationPage({ params }: { params: { slug: string } }) {
  const resolution = await resolvePublicInvitationPage(params.slug, new Date(), {
    find: getPublicInvitationBySlug,
  });
  if (resolution.kind === "not_found") notFound();

  if (resolution.kind === "unavailable" || resolution.kind === "ended") {
    const state = resolution.kind === "unavailable" ? "draft" : "expired";
    return (
      <InvitationPublicProvider locale={resolution.event.locale} timeZone="UTC">
        <InvitationStateView state={state} />
      </InvitationPublicProvider>
    );
  }

  const clientDetails = toPublicInvitationClientDetails(resolution);
  const initialComments = clientDetails.event.commentWallEnabled
    ? await listPublicInvitationComments(clientDetails.event.id)
    : { comments: [], nextCursor: null };
  let brandingEnabled = true;
  try {
    const settings = await getEventMemoriesSettings(clientDetails.event.id);
    if (settings) brandingEnabled = settings.brandingEnabled;
  } catch {
    brandingEnabled = true;
  }
  return (
    <EventSiteFonts>
      <InvitationPublicProvider locale={clientDetails.event.locale} timeZone={clientDetails.event.timezone}>
        <PublicInvitation
          event={clientDetails.event}
          state={clientDetails.state}
          rsvpSummary={clientDetails.rsvpSummary}
          initialComments={initialComments}
          nowIso={new Date().toISOString()}
          brandingEnabled={brandingEnabled}
        />
      </InvitationPublicProvider>
    </EventSiteFonts>
  );
}
