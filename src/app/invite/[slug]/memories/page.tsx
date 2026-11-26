import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { StateView } from "@/components/invitations/PublicInvitation";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { cookies } from "next/headers";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { invitationPageMetadata } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";
import enMessages from "../../../../../messages/en.json";
import esMessages from "../../../../../messages/es.json";

const MEMORIES_PALETTE = { accent: "#1f4a2c", background: "#efede5", text: "#1c2a20", surface: "#fbfaf6" };

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    let showBrand = true;
    if (invitation && !invitation.passcodeHash && (state === "published" || state === "rsvp_closed")) {
      try {
        const settings = await getEventMemoriesSettings(invitation.event.id);
        if (settings) showBrand = settings.brandingEnabled !== false;
      } catch {
        showBrand = true;
      }
    }
    return invitationPageMetadata(invitation, state, { page: "memories", showBrand });
  } catch {
    return invitationPageMetadata(null, null, { page: "memories" });
  }
}

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

  let viewerIsHost = hasFounderInvitationSession(process.env.ADMIN_PASSWORD, cookies().get("admin_session")?.value);
  if (!viewerIsHost) {
    try {
      const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
      const ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null;
      if (ownerId) viewerIsHost = await invitationOwnerOwnsEvent(ownerId, invitation.event.id);
    } catch {
      viewerIsHost = false;
    }
  }

  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone={invitation.event.timezone || "UTC"}>
      <GuestMemoriesApp
        eventId={invitation.event.id}
        eventTitle={invitation.event.honoreeNames.trim() || invitation.event.title}
        accent={MEMORIES_PALETTE.accent}
        background={MEMORIES_PALETTE.background}
        text={MEMORIES_PALETTE.text}
        surface={MEMORIES_PALETTE.surface}
        findMeEnabled={settings.findMeEnabled}
        brandingEnabled={settings.brandingEnabled}
        slug={invitation.event.slug}
        startsAt={invitation.event.startsAt}
        timeZone={invitation.event.timezone || "UTC"}
        venueName={invitation.event.venueName}
        address={invitation.event.address}
        eventType={invitation.event.eventType}
        locale={invitation.event.locale}
        schedule={invitation.event.eventSchedule ?? []}
        viewerIsHost={viewerIsHost}
      />
    </InvitationPublicProvider>
  );
}
