import { notFound } from "next/navigation";
import { GuestMessageComposer } from "@/components/invitations/GuestMessageComposer";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { composerRecipientChoices, getInvitationSmsBroadcastBudget, listInvitationBroadcasts, loadInvitationSmsOptOuts } from "@/lib/invitations/broadcasts";
import { buildMessageTemplateValues } from "@/lib/invitations/message-templates";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderMessagePage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();

  const [rows, history, smsBudget] = await Promise.all([
    listInvitationResponseRows(event.id),
    listInvitationBroadcasts(event.id),
    getInvitationSmsBroadcastBudget(event.id, event.smsBroadcastLimit ?? null),
  ]);
  const optedOutPhones = await loadInvitationSmsOptOuts(rows.flatMap((row) => row.phone ? [row.phone] : []));

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <GuestMessageComposer
        eventId={event.id}
        eventName={event.honoreeNames || event.title}
        backHref={`/admin/invitations/${event.id}`}
        templateValues={buildMessageTemplateValues(event)}
        smsBudget={smsBudget}
        recipients={{
          email: composerRecipientChoices(rows, "email"),
          sms: composerRecipientChoices(rows, "sms", optedOutPhones),
        }}
        initialTotalResponses={rows.length}
        initialHistory={history}
      />
    </InvitationPublicProvider>
  );
}
