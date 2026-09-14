import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import enMessages from "../../../../../../messages/en.json";
import esMessages from "../../../../../../messages/es.json";
import { EventEditor } from "@/components/invitations/EventEditor";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderInvitationDetailPage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();
  const messages = event.locale === "es" ? esMessages : enMessages;
  const media = await getInvitationMediaForManagement(event);

  return (
    <NextIntlClientProvider locale={event.locale} messages={messages} timeZone={event.timezone}>
      <EventEditor event={event} mode="founder" media={media} />
    </NextIntlClientProvider>
  );
}
