import Link from "next/link";
import { InvitationCopyLinkButton } from "@/components/invitations/InvitationCopyLinkButton";
import { listFounderEvents } from "@/lib/invitations/repository";
import type { FounderInvitationEventSummary } from "@/lib/invitations/repository";
import type { InvitationEventStatus } from "@/lib/invitations/types";

export const revalidate = 0;

const STATUS_STYLES: Record<InvitationEventStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-emerald-100 text-emerald-800",
  rsvp_closed: "bg-blue-100 text-blue-800",
  expired: "bg-violet-100 text-violet-800",
  offline: "bg-red-100 text-red-800",
};

function statusLabel(status: InvitationEventStatus): string {
  return status === "rsvp_closed" ? "RSVP closed" : `${status[0]?.toUpperCase()}${status.slice(1)}`;
}

function formatStart(value: string | null): string {
  if (!value) return "Date not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function FounderInvitationsPage() {
  let events: FounderInvitationEventSummary[];
  let loadError = false;
  try {
    events = await listFounderEvents();
  } catch (error) {
    console.error("[admin/invitations] list failed", { error });
    events = [];
    loadError = true;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Invitations</h1>
          <p className="mt-1 text-sm text-gray-500">Provision owners and monitor every event from one place.</p>
        </div>
        <Link
          href="/admin/invitations/new"
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          New invitation
        </Link>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Invitations could not be loaded. Refresh the page to try again.
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-gray-950">No invitations yet</h2>
          <p className="mt-1 text-sm text-gray-500">Create the first owner and draft event.</p>
          <Link href="/admin/invitations/new" className="mt-4 inline-block text-sm font-semibold text-amber-700 hover:text-amber-800">
            Create an invitation
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-200">
            {events.map((event) => (
              <article key={event.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-gray-950">{event.title}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[event.status]}`}>
                        {statusLabel(event.status)}
                      </span>
                      {event.notificationWarningCount > 0 && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                          {event.notificationWarningCount} notification warning{event.notificationWarningCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{event.ownerName} · {event.ownerEmail}</p>
                    <p className="mt-1 text-sm text-gray-500">{formatStart(event.startsAt)}</p>
                    <p className="mt-3 text-sm text-gray-700">
                      <span className="font-semibold">{event.attendingPeople}</span> attending
                      <span className="mx-2 text-gray-300">/</span>
                      <span className="font-semibold">{event.declinedParties}</span> declined parties
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <Link href={`/admin/invitations/${event.id}`} className="font-semibold text-amber-700 hover:text-amber-800">
                      Edit
                    </Link>
                    <Link href={`/invite/${event.slug}`} target="_blank" className="font-medium text-gray-600 hover:text-gray-950">
                      Preview
                    </Link>
                    <InvitationCopyLinkButton slug={event.slug} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
