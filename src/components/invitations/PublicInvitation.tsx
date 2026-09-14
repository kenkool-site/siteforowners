"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Clock3, MapPin, Navigation } from "lucide-react";
import {
  eventIcsDataUrl,
  googleEventCalendarUrl,
  type EventCalendarInput,
} from "@/lib/invitations/calendar";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";
import type {
  EffectiveEventState,
} from "@/lib/invitations/state";
import type { PublicInvitationEvent as RepositoryPublicInvitationEvent } from "@/lib/invitations/repository-core";

export type PublicInvitationEvent = Pick<
  RepositoryPublicInvitationEvent,
  | "id"
  | "slug"
  | "eventType"
  | "locale"
  | "title"
  | "honoreeNames"
  | "description"
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "venueName"
  | "address"
  | "mapUrl"
  | "themeKey"
  | "primaryColor"
  | "accentColor"
  | "fontPairKey"
  | "showPublicRsvpCount"
>;

type PublicInvitationProps = {
  event: PublicInvitationEvent;
  state: Extract<EffectiveEventState, "published" | "rsvp_closed">;
  media: InvitationMediaSnapshot;
  rsvpSummary: { attendingPeople: number; declinedParties: number };
};

type ThemeKey = "classic" | "romantic" | "celebration";
type InvitationLayout = "centered-frame" | "image-asymmetry" | "offset-blocks";

type ThemeDefinition = {
  layout: InvitationLayout;
  page: string;
  stage: string;
  opening: string;
  designedOpening: string;
  title: string;
  message: string;
  details: string;
  media: string;
  count: string;
  rsvp: string;
};

const THEMES: Record<ThemeKey, ThemeDefinition> = {
  classic: {
    layout: "centered-frame",
    page: "bg-[#F7F5EF] text-[#172238]",
    stage: "mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10",
    opening: "border border-[#B9B5AB] bg-[#FCFBF7] p-3 text-center shadow-[inset_0_0_0_7px_#F7F5EF] sm:p-8",
    designedOpening: "border border-[#B9B5AB] bg-[#FCFBF7] p-3 text-center shadow-[inset_0_0_0_7px_#F7F5EF] sm:p-8",
    title: "mx-auto max-w-3xl text-center",
    message: "mx-auto max-w-2xl text-center",
    details: "mx-auto max-w-3xl border-y border-[#C9C5BB]",
    media: "mx-auto max-w-4xl",
    count: "mx-auto max-w-2xl border border-[#C9C5BB] bg-[#FCFBF7]",
    rsvp: "mx-auto max-w-2xl bg-[#172238] text-white",
  },
  romantic: {
    layout: "image-asymmetry",
    page: "bg-[#E8DEEC] text-[#341D3B]",
    stage: "mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-10",
    opening: "overflow-hidden rounded-[4rem_1.25rem_4rem_1.25rem] bg-[#D8C5DF] p-2 shadow-[0_28px_90px_rgba(72,39,82,0.18)] md:mr-[12%]",
    designedOpening: "bg-[#D8C5DF] p-2 shadow-[0_28px_90px_rgba(72,39,82,0.18)] md:mr-[12%]",
    title: "relative z-10 -mt-8 ml-auto max-w-3xl rounded-[2.75rem_0.75rem_2.75rem_0.75rem] bg-[#F6F0F7] px-6 py-9 text-left shadow-[0_20px_60px_rgba(72,39,82,0.14)] sm:px-10 md:-mt-24 md:w-[58%]",
    message: "max-w-2xl px-2 md:ml-[8%]",
    details: "ml-auto max-w-3xl rounded-[2.5rem_0.75rem_2.5rem_0.75rem] bg-[#F6F0F7] shadow-[0_18px_55px_rgba(72,39,82,0.12)]",
    media: "max-w-5xl md:mr-auto md:w-[86%]",
    count: "ml-auto max-w-2xl rounded-[2rem_0.75rem_2rem_0.75rem] bg-[#D5C0DD]",
    rsvp: "max-w-2xl rounded-[0.75rem_2.5rem_0.75rem_2.5rem] bg-[#432448] text-white md:ml-[8%]",
  },
  celebration: {
    layout: "offset-blocks",
    page: "bg-[#F4F0E8] text-[#132765]",
    stage: "mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-10",
    opening: "relative ml-auto border-[10px] border-[#2753C7] bg-white p-1 shadow-[-18px_18px_0_#F06449] md:w-[82%]",
    designedOpening: "relative ml-auto border-[10px] border-[#2753C7] bg-white p-1 shadow-[-18px_18px_0_#F06449] md:w-[82%]",
    title: "relative max-w-4xl bg-[#2753C7] px-6 py-9 text-left text-white sm:px-10 md:-mt-12 md:w-[70%]",
    message: "ml-auto max-w-3xl border-l-[10px] border-[#F06449] pl-6",
    details: "max-w-4xl border-2 border-[#2753C7] bg-white shadow-[14px_14px_0_#F4C849]",
    media: "ml-auto max-w-5xl",
    count: "max-w-2xl bg-[#F4C849] text-[#14255A]",
    rsvp: "ml-auto max-w-2xl bg-[#F06449] text-[#24152D]",
  },
};

function themeFor(key: string): ThemeDefinition {
  return key === "romantic" || key === "celebration" ? THEMES[key] : THEMES.classic;
}

function InvitationImage({
  src,
  alt,
  className,
  fit = "cover",
}: {
  src: string;
  alt: string;
  className?: string;
  fit?: "contain" | "cover";
}) {
  return <img src={src} alt={alt} className={`block h-auto w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${className ?? ""}`} />;
}

function StateView({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F2EEF4] px-5 py-12 text-[#2B2231]">
      <section className="w-full max-w-lg border-y border-[#BFB3C4] py-14 text-center">
        <div aria-hidden="true" className="mx-auto mb-7 h-12 w-px bg-[#73516F]" />
        {children}
      </section>
    </main>
  );
}

export function InvitationStateView({ state }: { state: "draft" | "expired" }) {
  const t = useTranslations("invitations.public");
  if (state === "draft") {
    return <StateView><h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{t("unavailable.title")}</h1><p className="mt-4 text-base leading-7 text-[#665C69]">{t("unavailable.body")}</p></StateView>;
  }
  return <StateView><h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{t("ended.title")}</h1><p className="mt-4 text-base leading-7 text-[#665C69]">{t("ended.body")}</p></StateView>;
}

export function PublicInvitation({ event, state, media, rsvpSummary }: PublicInvitationProps) {
  const t = useTranslations("invitations.public");

  const theme = themeFor(event.themeKey);
  const titleFont = event.fontPairKey === "fraunces-geist"
    ? "font-[family-name:var(--font-fraunces)]"
    : "font-sans";
  const variables = {
    "--invitation-primary": event.primaryColor,
    "--invitation-accent": event.accentColor,
  } as CSSProperties;
  const heroMedia = media.designedInvite ?? media.cover;
  const date = event.startsAt
    ? new Intl.DateTimeFormat(event.locale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: event.timezone,
      }).format(new Date(event.startsAt))
    : t("datePending");
  const calendarInput: EventCalendarInput | null = event.startsAt ? {
    uid: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    location: [event.venueName, event.address].filter(Boolean).join(", "),
    description: event.description,
  } : null;
  const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-current px-5 py-2.5 text-sm font-semibold outline-none transition-[transform,background-color] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none";

  return (
    <main
      data-invitation-theme={event.themeKey}
      data-invitation-layout={theme.layout}
      className={`min-h-screen overflow-x-hidden font-sans ${theme.page}`}
      style={variables}
    >
      <article className={theme.stage}>
        {heroMedia && (
          <div className={media.designedInvite ? theme.designedOpening : theme.opening} style={{ borderColor: event.primaryColor }}>
            <InvitationImage
              src={heroMedia.url}
              alt={media.designedInvite ? t("designedInviteAlt") : t("coverAlt", { title: event.title })}
              fit={media.designedInvite ? "contain" : "cover"}
              className={media.designedInvite
                ? "max-w-full"
                : theme.layout === "image-asymmetry"
                  ? "max-h-[78vh] rounded-[3.5rem_1rem_3.5rem_1rem]"
                  : "max-h-[82vh]"}
            />
          </div>
        )}

        <header className={`${theme.title} ${heroMedia ? "mt-8 md:mt-12" : "mt-10"}`}>
          <p className="text-base font-medium leading-7 opacity-80">{event.eventType}</p>
          <h1 className={`${titleFont} mt-3 text-[clamp(3rem,12vw,6.8rem)] leading-[0.9] tracking-[-0.045em]`}>
            {event.title}
          </h1>
          {event.honoreeNames && <p className="mt-6 text-lg leading-8 opacity-85">{event.honoreeNames}</p>}
          <p className="mt-5 text-base font-semibold leading-7 sm:text-lg">{date}</p>
          <div aria-hidden="true" className="mt-7 h-1.5 w-24" style={{ backgroundColor: event.accentColor }} />
        </header>

        {event.description && (
          <section className={`${theme.message} mt-12 sm:mt-16`}>
            <p className={`${titleFont} text-2xl leading-10 sm:text-3xl sm:leading-[1.55]`}>{event.description}</p>
          </section>
        )}

        <section className={`${theme.details} mt-12 px-5 py-8 sm:mt-16 sm:px-9`} aria-labelledby="invitation-details-heading">
          <h2 id="invitation-details-heading" className={`${titleFont} text-3xl`}>{t("details")}</h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0" />
              <div><p className="font-semibold">{t("when")}</p><p className="mt-1 leading-7 opacity-80">{date}</p></div>
            </div>
            {(event.venueName || event.address) && (
              <div className="flex gap-3">
                <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0" />
                <div><p className="font-semibold">{t("where")}</p>{event.venueName && <p className="mt-1 leading-7">{event.venueName}</p>}{event.address && <p className="leading-7 opacity-80">{event.address}</p>}</div>
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {event.mapUrl && <a href={event.mapUrl} target="_blank" rel="noreferrer" className={actionClass}><Navigation aria-hidden="true" className="size-4" />{t("openMap")}</a>}
            {calendarInput && <a href={googleEventCalendarUrl(calendarInput)} target="_blank" rel="noreferrer" className={actionClass}><CalendarDays aria-hidden="true" className="size-4" />{t("googleCalendar")}</a>}
            {calendarInput && <a href={eventIcsDataUrl(calendarInput)} download={`${event.slug}.ics`} className={actionClass}><Clock3 aria-hidden="true" className="size-4" />{t("downloadCalendar")}</a>}
          </div>
        </section>

        {(media.gallery.length > 0 || media.video) && (
          <section className={`${theme.media} mt-12 sm:mt-16`} aria-labelledby="invitation-gallery-heading">
            <h2 id="invitation-gallery-heading" className={`${titleFont} text-3xl sm:text-4xl`}>{t("gallery")}</h2>
            {media.gallery.length > 0 && <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3">{media.gallery.map((item, index) => <InvitationImage key={item.id ?? item.path} src={item.url} alt={item.altText || t("galleryAlt", { number: index + 1 })} className={`aspect-[4/5] ${index === 0 ? "col-span-2 sm:aspect-[16/10]" : ""}`} />)}</div>}
            {media.video && <video controls preload="metadata" className="mt-6 aspect-video w-full bg-black" aria-label={t("videoLabel")}><source src={media.video.url} /></video>}
          </section>
        )}

        {event.showPublicRsvpCount && (
          <section className={`${theme.count} mt-12 grid grid-cols-2 gap-4 px-5 py-7 text-center sm:mt-16 sm:px-9`} aria-label={t("countsLabel")}>
            <p><strong className={`${titleFont} block text-4xl`}>{rsvpSummary.attendingPeople}</strong><span className="mt-1 block text-sm leading-5">{t("attending", { count: rsvpSummary.attendingPeople })}</span></p>
            <p><strong className={`${titleFont} block text-4xl`}>{rsvpSummary.declinedParties}</strong><span className="mt-1 block text-sm leading-5">{t("declined", { count: rsvpSummary.declinedParties })}</span></p>
          </section>
        )}

        <section id="rsvp" className={`${theme.rsvp} mb-8 mt-12 px-6 py-9 sm:mb-12 sm:mt-16 sm:px-10`}>
          <h2 className={`${titleFont} text-3xl sm:text-4xl`}>{state === "rsvp_closed" ? t("rsvp.closedTitle") : t("rsvp.title")}</h2>
          <p className="mt-3 max-w-xl text-base leading-7 opacity-85">{state === "rsvp_closed" ? t("rsvp.closedBody") : t("rsvp.placeholder")}</p>
        </section>
      </article>
    </main>
  );
}
