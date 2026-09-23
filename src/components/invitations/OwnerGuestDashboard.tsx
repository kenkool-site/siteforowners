"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { InvitationEventStatus } from "@/lib/invitations/types";
import type { InvitationResponsesDashboard as InvitationResponsesDashboardData } from "@/lib/invitations/responses";
import { invitationPublicUrl } from "@/lib/invitations/public-url";
import { InvitationCopyLinkButton } from "./InvitationCopyLinkButton";
import { ResponsesDashboard } from "./ResponsesDashboard";
import type { InvitationGuestbookSummary } from "@/lib/invitations/comments";
import { OwnerMemoriesCard, type OwnerMemoriesCardData } from "./memories/OwnerMemoriesCard";

type OwnerGuestDashboardEvent = {
  id: string;
  title: string;
  honoreeNames: string;
  status: InvitationEventStatus;
  slug: string;
  publicSubdomain: string | null;
};

export function OwnerGuestDashboard({ event, initialData, guestbook = { enabled: false, totalCount: 0, newCount: 0 }, memories }: {
  event: OwnerGuestDashboardEvent;
  initialData?: InvitationResponsesDashboardData;
  guestbook?: InvitationGuestbookSummary;
  memories?: OwnerMemoriesCardData;
}) {
  const t = useTranslations("invitations.manage.dashboard");
  const publicUrl = invitationPublicUrl(event);

  return (
    <main className="min-h-screen bg-[#F7F4F8] text-[#2B2231]">
      <header className="border-b border-[#d8cedc] bg-white px-4 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link href="/invitations" className="text-sm font-medium text-[#675d6a] underline-offset-4 hover:text-[#2B2231] hover:underline">{t("back")}</Link>
              <h1 className="mt-4 font-[family-name:var(--font-fraunces)] text-4xl font-medium tracking-[-0.035em] sm:text-5xl">{t("title")}</h1>
              <p className="mt-2 text-base leading-7 text-[#675d6a]">{t("subtitle", { name: event.honoreeNames || event.title })}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#cfc3d3] bg-[#F7F4F8] px-3 py-2 text-sm font-semibold text-[#55405a]">{t(`status.${event.status}`)}</span>
              <Link href={`/invitations/manage/${event.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] focus-visible:ring-offset-2">{t("customize")}</Link>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#6D456F] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] focus-visible:ring-offset-2">{t("preview")}</a>
              <span className="inline-flex min-h-11 items-center rounded-md px-2 text-sm">
                <InvitationCopyLinkButton slug={event.slug} publicSubdomain={event.publicSubdomain} label={t("copy")} copiedLabel={t("copied")} />
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-9">
        <div className="flex flex-col gap-4 rounded-lg border border-[#cfc3d3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold">{t("guestbook.title")}</h2>{guestbook.newCount > 0 && <span className="rounded-full bg-[#6D456F] px-2.5 py-1 text-xs font-semibold text-white">{t("guestbook.new", { count: guestbook.newCount })}</span>}</div><p className="mt-1 text-sm text-[#675d6a]">{t(guestbook.enabled ? "guestbook.enabled" : "guestbook.disabled", { count: guestbook.totalCount })}</p></div>
          <Link href={`/invitations/manage/${event.id}/guestbook`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]">{t("guestbook.open")}</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[#cfc3d3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold">{t("message.title")}</h2><p className="mt-1 text-sm text-[#675d6a]">{t("message.description")}</p></div>
          <Link href={`/invitations/manage/${event.id}/message`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]">{t("message.open")}</Link>
        </div>
      </section>

      {memories && <OwnerMemoriesCard eventId={event.id} slug={event.slug} initial={memories} />}

      <section className="mx-auto max-w-6xl px-0 py-6 sm:px-6 sm:py-9" aria-labelledby="guest-ledger-heading">
        <div className="px-4 sm:px-0">
          <h2 id="guest-ledger-heading" className="text-xl font-semibold tracking-[-0.02em]">{t("ledgerTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("ledgerHelp")}</p>
        </div>
        <div className="mt-5 overflow-hidden border-y border-[#cfc3d3] bg-white sm:rounded-lg sm:border">
          <ResponsesDashboard eventId={event.id} mode="owner" initialData={initialData} />
        </div>
      </section>
    </main>
  );
}
