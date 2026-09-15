import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { listOwnerInvitationEvents } from "@/lib/invitations/repository";
import { invitationPublicUrl } from "@/lib/invitations/public-url";

export const revalidate = 0;

function ownerIdFromSignedSession(): string | null {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  if (!signed) return null;
  try {
    return verifyOwnerSession(signed)?.ownerId ?? null;
  } catch {
    return null;
  }
}

export default async function OwnerInvitationsPage({ searchParams }: { searchParams?: { lang?: string | string[] } }) {
  const ownerId = ownerIdFromSignedSession();
  if (!ownerId) redirect("/invitations/login");

  const locale = searchParams?.lang === "es" ? "es" : "en";
  const messages = locale === "es" ? esMessages : enMessages;
  const copy = messages.invitations.manage;
  let events: NonNullable<Awaited<ReturnType<typeof listOwnerInvitationEvents>>[number]>[] = [];
  let loadError = false;
  try {
    events = (await listOwnerInvitationEvents(ownerId)).filter((event): event is NonNullable<typeof event> => Boolean(event));
  } catch (error) {
    console.error("[invitations] owner list failed", { error });
    loadError = true;
  }

  if (!loadError && events.length === 1) redirect(`/invitations/manage/${events[0].id}`);

  return (
    <main className="min-h-screen bg-[#FBFAFC] px-4 py-10 text-[#2B2231] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">{copy.title}</h1>
        <p className="mt-2 text-[#675d6a]">{copy.subtitle}</p>
        {loadError ? (
          <p className="mt-8 border-l-4 border-[#A33A3A] bg-red-50 px-4 py-3 text-sm text-[#7f2929]">{copy.loadError}</p>
        ) : events.length === 0 ? (
          <div className="mt-8 border-y border-[#ddd4e1] py-10">
            <h2 className="font-semibold">{copy.emptyTitle}</h2>
            <p className="mt-1 text-sm text-[#675d6a]">{copy.emptyBody}</p>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {events.map((event) => (
              <article key={event.id} className="flex flex-col gap-4 rounded-md border border-[#ddd4e1] border-l-4 border-l-[#6D456F] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                  <p className="mt-1 text-sm text-[#675d6a]">
                    {event.startsAt ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: event.timezone }).format(new Date(event.startsAt)) : copy.eventDatePending}
                  </p>
                  <a href={invitationPublicUrl(event)} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-[#6D456F] underline underline-offset-2">{invitationPublicUrl(event)}</a>
                </div>
                <Link href={`/invitations/manage/${event.id}`} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#6D456F] px-4 py-2 text-sm font-semibold text-white">{copy.open}</Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
