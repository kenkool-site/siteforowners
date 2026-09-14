import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationCopyLinkButton } from "@/components/invitations/InvitationCopyLinkButton";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderInvitationDetailPage({
  params,
}: {
  params: { eventId: string };
}) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();

  const start = event.startsAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))
    : "Not set";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/invitations" className="text-sm font-medium text-gray-600 hover:text-gray-950">
        Back to invitations
      </Link>
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700">{event.status === "rsvp_closed" ? "RSVP closed" : event.status}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">{event.title}</h1>
            <p className="mt-2 text-sm text-gray-600">Owned by {event.owner.name} · {event.owner.email}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href={`/invite/${event.slug}`} target="_blank" className="font-semibold text-amber-700 hover:text-amber-800">
              Preview
            </Link>
            <InvitationCopyLinkButton slug={event.slug} />
          </div>
        </div>

        <dl className="mt-8 grid gap-x-8 gap-y-5 border-y border-gray-200 py-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-500">Starts</dt>
            <dd className="mt-1 font-medium text-gray-950">{start}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Event type and language</dt>
            <dd className="mt-1 font-medium text-gray-950">{event.eventType} · {event.locale.toUpperCase()}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Public path</dt>
            <dd className="mt-1 break-all font-medium text-gray-950">/invite/{event.slug}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">RSVP and message limits</dt>
            <dd className="mt-1 font-medium text-gray-950">
              {event.submissionLimit} responses · {event.emailNotificationLimit} email · {event.smsNotificationLimit} SMS
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">
          The full event editor is added in the next implementation task. This summary is safe to share with founder operators and excludes credential hashes.
        </div>
      </div>
    </div>
  );
}
