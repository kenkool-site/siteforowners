import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventSiteFonts } from "@/components/invitations/EventSiteFonts";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestListPreview } from "@/components/invitations/guest-list/GuestListPreview";
import { PREVIEW_COVER, PREVIEW_EVENT_NAME, PREVIEW_WHEN, previewGuests, previewInviteBody, previewInviteEstimate } from "@/lib/invitations/guest-list-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private guest list preview",
  robots: { index: false, follow: false },
};

const SCREENS = ["founder", "empty", "list", "send", "rsvp", "confirm", "gate", "code", "missing", "replies", "flow"] as const;

export default function PrivateGuestListPreviewPage({ searchParams }: { searchParams: { screen?: string } }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const screen = SCREENS.find((value) => value === searchParams.screen) ?? "list";
  return (
    <EventSiteFonts>
      <InvitationPublicProvider locale="en" timeZone="America/Chicago">
        <GuestListPreview
          screen={screen}
          eventName={PREVIEW_EVENT_NAME}
          eventWhen={PREVIEW_WHEN}
          guests={previewGuests}
          sampleBody={previewInviteBody}
          segments={previewInviteEstimate.segments}
          perMessage={previewInviteEstimate.perMessage}
          coverUrl={PREVIEW_COVER}
        />
      </InvitationPublicProvider>
    </EventSiteFonts>
  );
}
