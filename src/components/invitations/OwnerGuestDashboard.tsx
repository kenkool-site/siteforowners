"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { InvitationEventStatus } from "@/lib/invitations/types";
import type { InvitationResponsesDashboard as InvitationResponsesDashboardData } from "@/lib/invitations/responses";
import { invitationPublicUrl } from "@/lib/invitations/public-url";
import { InvitationCopyLinkButton } from "./InvitationCopyLinkButton";
import { ResponsesDashboard } from "./ResponsesDashboard";

type OwnerGuestDashboardEvent = {
  id: string;
  title: string;
  honoreeNames: string;
  status: InvitationEventStatus;
  slug: string;
  publicSubdomain: string | null;
};

export function OwnerGuestDashboard({ event, initialData }: {
  event: OwnerGuestDashboardEvent;
  initialData?: InvitationResponsesDashboardData;
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
