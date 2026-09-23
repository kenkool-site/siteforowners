import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getInvitationPasscodeCookieName, verifyInvitationPasscodeSession } from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

export const dynamic = "force-dynamic";

export default async function GuestMemoriesPage({ params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  // Matches resolvePublicInvitationPage's own gate (src/lib/invitations/public-access.ts):
  // passcodeHash lives on the invitation itself, not on invitation.event.
  if (invitation.passcodeHash) {
    const signed = cookies().get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    let hasAccess = false;
    try {
      hasAccess = Boolean(signed && verifyInvitationPasscodeSession(signed, invitation.event.id));
    } catch {
      hasAccess = false;
    }
    if (!hasAccess) redirect(`/invite/${params.slug}`); // same passcode gate the public page itself enforces
  }

  const settings = await getEventMemoriesSettings(invitation.event.id);
  if (!settings || !settings.memoriesEnabled) notFound();

  const recipe = invitation.event.designRecipe ?? DEFAULT_INVITATION_DESIGN_RECIPE;

  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <GuestMemoriesApp
        eventId={invitation.event.id}
        accent={recipe.palette.accent}
        background={recipe.palette.background}
        text={recipe.palette.text}
        surface={recipe.palette.surface}
      />
    </InvitationPublicProvider>
  );
}
