import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PasscodeGate } from "@/components/invitations/PasscodeGate";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { InvitationStateView, PublicInvitation } from "@/components/invitations/PublicInvitation";
import {
  getInvitationPasscodeCookieName,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import {
  invitationPageMetadata,
  resolvePublicInvitationPage,
  toPublicInvitationClientDetails,
} from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug, listPublicInvitationComments } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    return invitationPageMetadata(invitation, state);
  } catch {
    return invitationPageMetadata(null, null);
  }
}

export default async function PublicInvitationPage({ params, searchParams }: { params: { slug: string }; searchParams: { next?: string } }) {
  const resolution = await resolvePublicInvitationPage(params.slug, new Date(), {
    find: getPublicInvitationBySlug,
    hasPasscodeAccess: (event) => {
      const signed = cookies().get(getInvitationPasscodeCookieName(event.id))?.value;
      try {
        return Boolean(signed && verifyInvitationPasscodeSession(signed, event.id));
      } catch {
        return false;
      }
    },
    // This runs only after lifecycle and passcode checks: signing storage URLs grants detail access.
    loadMedia: getInvitationMediaForManagement,
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

  if (resolution.kind === "passcode") {
    // Only trust a same-event relative path — anything else (an absolute
    // URL, a different event's path) is dropped rather than handed to
    // window.location.href client-side, which would otherwise make ?next=
    // an open redirect.
    const redirectTo =
      typeof searchParams.next === "string" && searchParams.next.startsWith(`/invite/${resolution.event.slug}`)
        ? searchParams.next
        : undefined;
    return (
      <InvitationPublicProvider locale={resolution.event.locale} timeZone="UTC">
        <PasscodeGate slug={resolution.event.slug} redirectTo={redirectTo} />
      </InvitationPublicProvider>
    );
  }

  const clientDetails = toPublicInvitationClientDetails(resolution);
  const initialComments = clientDetails.event.commentWallEnabled
    ? await listPublicInvitationComments(clientDetails.event.id)
    : { comments: [], nextCursor: null };
  return (
    <InvitationPublicProvider locale={clientDetails.event.locale} timeZone={clientDetails.event.timezone}>
      <PublicInvitation
        event={clientDetails.event}
        state={clientDetails.state}
        media={clientDetails.media}
        rsvpSummary={clientDetails.rsvpSummary}
        initialComments={initialComments}
      />
    </InvitationPublicProvider>
  );
}
