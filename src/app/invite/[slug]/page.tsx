import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { PasscodeGate } from "@/components/invitations/PasscodeGate";
import { PublicInvitation } from "@/components/invitations/PublicInvitation";
import {
  getInvitationPasscodeCookieName,
  verifyInvitationPasscodeSession,
} from "@/lib/invitations/auth";
import { getInvitationMediaForManagement, type InvitationMediaSnapshot } from "@/lib/invitations/media";
import { invitationPageMetadata, resolvePublicInvitationPage } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

export const dynamic = "force-dynamic";

const EMPTY_MEDIA: InvitationMediaSnapshot = {
  designedInvite: null,
  cover: null,
  video: null,
  gallery: [],
};

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
  const messages = resolution.event.locale === "es" ? esMessages : enMessages;

  if (resolution.kind === "unavailable" || resolution.kind === "ended") {
    const state = resolution.kind === "unavailable" ? "draft" : "expired";
    return (
      <NextIntlClientProvider locale={resolution.event.locale} messages={messages} timeZone={resolution.event.timezone}>
        <PublicInvitation event={resolution.event} state={state} media={EMPTY_MEDIA} rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
      </NextIntlClientProvider>
    );
  }

  if (resolution.kind === "passcode") {
    return (
      <NextIntlClientProvider locale={resolution.event.locale} messages={messages} timeZone={resolution.event.timezone}>
        <PasscodeGate slug={resolution.event.slug} />
      </NextIntlClientProvider>
    );
  }

  return (
    <NextIntlClientProvider locale={resolution.event.locale} messages={messages} timeZone={resolution.event.timezone}>
      <PublicInvitation
        event={resolution.event}
        state={resolution.state}
        media={resolution.media}
        rsvpSummary={resolution.rsvpSummary}
      />
    </NextIntlClientProvider>
  );
}
