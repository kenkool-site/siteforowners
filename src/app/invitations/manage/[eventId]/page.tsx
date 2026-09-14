import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import enMessages from "../../../../../messages/en.json";
import esMessages from "../../../../../messages/es.json";
import { EventEditor } from "@/components/invitations/EventEditor";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function OwnerInvitationManagementPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try {
    ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null;
  } catch {
    ownerId = null;
  }
  if (!ownerId) redirect("/invitations/login");

  const event = await getInvitationEventForManagement(params.eventId);
  if (!event || event.ownerId !== ownerId) notFound();
  const messages = event.locale === "es" ? esMessages : enMessages;
  const media = await getInvitationMediaForManagement(event);

  return (
    <NextIntlClientProvider locale={event.locale} messages={messages} timeZone={event.timezone}>
      <EventEditor event={event} mode="owner" media={media} />
    </NextIntlClientProvider>
  );
}
