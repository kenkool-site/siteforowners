import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { StateView } from "@/components/invitations/PublicInvitation";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";
import enMessages from "../../../../../messages/en.json";
import esMessages from "../../../../../messages/es.json";

export const revalidate = 3600;

export default async function GuestMemoriesPage({ params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  if (invitation.event.status === "offline") notFound();

  const settings = await getEventMemoriesSettings(invitation.event.id);
  if (!settings || !settings.memoriesEnabled) {
    const copy = (invitation.event.locale === "es" ? esMessages : enMessages).invitations.public;
    const referenceDate = invitation.event.endsAt ?? invitation.event.startsAt;
    const eventHasPassed = Boolean(referenceDate && Date.parse(referenceDate) <= Date.now());
    const unavailableCopy = eventHasPassed ? copy.memories.unavailable.past : copy.memories.unavailable.upcoming;
    return (
      <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
        <StateView>
          <h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{unavailableCopy.title}</h1>
          <p className="mt-4 text-base leading-7 text-[#665C69]">{unavailableCopy.body}</p>
          <Link href={`/invite/${params.slug}`} className="mt-6 inline-block text-sm font-semibold text-[#73516F] underline-offset-4 hover:underline">
            {copy.viewInvitation}
          </Link>
        </StateView>
      </InvitationPublicProvider>
    );
  }

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
