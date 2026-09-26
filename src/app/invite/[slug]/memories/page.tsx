import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getInvitationPasscodeCookieName, verifyInvitationPasscodeSession } from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

export const dynamic = "force-dynamic";

export default async function GuestMemoriesPage({ params, searchParams }: { params: { slug: string }; searchParams: { photo?: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  // A host taking the event fully offline is an explicit kill switch — Memories
  // must not stay reachable just because memories_enabled is still true.
  // Deliberately narrower than resolvePublicInvitationPage's full state machine:
  // "draft"/"expired"/"rsvp_closed" govern the RSVP lifecycle, not this page —
  // Memories has its own independent 14-day upload-window mechanic and a
  // 12-month post-event browsing window by design, so only "offline" (a literal,
  // explicit status the host sets) gates this page.
  if (invitation.event.status === "offline") notFound();

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
    if (!hasAccess) {
      // Preserve where the guest was actually headed (e.g. a shared photo
      // link's ?photo= param) through the passcode challenge — PasscodeGate
      // reads this back via the general invite page and navigates here again
      // on success, instead of stranding the guest on the general invite page.
      const photoParam = typeof searchParams.photo === "string" ? `?photo=${encodeURIComponent(searchParams.photo)}` : "";
      const next = encodeURIComponent(`/invite/${params.slug}/memories${photoParam}`);
      redirect(`/invite/${params.slug}?next=${next}`); // same passcode gate the public page itself enforces
    }
  }

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
      />
    </InvitationPublicProvider>
  );
}
