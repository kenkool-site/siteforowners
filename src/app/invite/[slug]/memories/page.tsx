import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

export const revalidate = 3600;

export default async function GuestMemoriesPage({ params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  if (invitation.event.status === "offline") notFound();

  const settings = await getEventMemoriesSettings(invitation.event.id);
  if (!settings || !settings.memoriesEnabled) notFound();

  const recipe = invitation.event.designRecipe ?? DEFAULT_INVITATION_DESIGN_RECIPE;

  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <GuestMemoriesApp
        eventId={invitation.event.id}
        eventTitle={invitation.event.honoreeNames.trim() || invitation.event.title}
        accent={recipe.palette.accent}
        background={recipe.palette.background}
        text={recipe.palette.text}
        surface={recipe.palette.surface}
        findMeEnabled={settings.findMeEnabled}
      />
    </InvitationPublicProvider>
  );
}
