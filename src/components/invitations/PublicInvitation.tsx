"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Building2, CalendarDays, Clock3, MapPin, Navigation, Plane } from "lucide-react";
import {
  eventIcsDataUrl,
  googleEventCalendarUrl,
  type EventCalendarInput,
} from "@/lib/invitations/calendar";
import { InvitationRsvpDialog } from "./InvitationRsvpDialog";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";
import { DEFAULT_INVITATION_DESIGN_RECIPE, readableTextColor } from "@/lib/invitations/design-recipe";
import { hotelMapUrl } from "@/lib/invitations/travel";
import { InvitationHero } from "./InvitationHero";
import { InvitationFooter } from "./InvitationFooter";
import { InvitationStyleGuide } from "./InvitationStyleGuide";
import type {
  EffectiveEventState,
} from "@/lib/invitations/state";
import type { PublicInvitationEvent as RepositoryPublicInvitationEvent } from "@/lib/invitations/repository-core";
import type { InvitationCommentPage } from "@/lib/invitations/comments";
import { InvitationCommentWall } from "./InvitationCommentWall";

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
  | "rsvpDeadline"
  | "timezone"
  | "venueName"
  | "venueUrl"
  | "address"
  | "mapUrl"
  | "travelInfo"
  | "styleGuide"
  | "additionalSections"
  | "eventSchedule"
  | "themeKey"
  | "primaryColor"
  | "accentColor"
  | "fontPairKey"
  | "designRecipe"
  | "showPublicRsvpCount"
  | "commentWallEnabled"
>;

type PublicInvitationProps = {
  preview?: boolean;
  event: PublicInvitationEvent;
  state: Extract<EffectiveEventState, "published" | "rsvp_closed">;
  media: InvitationMediaSnapshot;
  rsvpSummary: { attendingPeople: number; declinedParties: number };
  initialComments?: InvitationCommentPage;
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
  return <img src={src} alt={alt} className={`block w-full ${fit === "contain" ? "h-auto object-contain" : "h-full object-cover"} ${className ?? ""}`} />;
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

export function PublicRsvpAggregate({
  summary,
  titleClass,
  className,
}: {
  summary: { attendingPeople: number; declinedParties: number };
  titleClass: string;
  className?: string;
}) {
  const t = useTranslations("invitations.public");
  return (
    <section className={`${className ?? ""} px-5 py-8 text-center sm:px-9 sm:py-10`} aria-label={t("countsLabel")}>
      <p className={`${titleClass} text-3xl leading-tight sm:text-4xl`}>{t("celebrating", { count: summary.attendingPeople })}</p>
    </section>
  );
}

export function InvitationStateView({ state }: { state: "draft" | "expired" }) {
  const t = useTranslations("invitations.public");
  if (state === "draft") {
    return <StateView><h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{t("unavailable.title")}</h1><p className="mt-4 text-base leading-7 text-[#665C69]">{t("unavailable.body")}</p></StateView>;
  }
  return <StateView><h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{t("ended.title")}</h1><p className="mt-4 text-base leading-7 text-[#665C69]">{t("ended.body")}</p></StateView>;
}

export function PublicInvitation({ event, state, media, rsvpSummary, preview = false, initialComments = { comments: [], nextCursor: null } }: PublicInvitationProps) {
  const t = useTranslations("invitations.public");

  const theme = themeFor(event.themeKey);
  const recipe = event.designRecipe ?? DEFAULT_INVITATION_DESIGN_RECIPE;
  const recreated = event.designRecipe !== null;
  const displayStyles = {
    "formal-script": "font-[family-name:var(--font-fraunces)] italic",
    "editorial-serif": "font-[family-name:var(--font-fraunces)]",
    "classic-serif": "font-[family-name:var(--font-fraunces)]",
    "geometric-sans": "font-sans uppercase",
    "humanist-sans": "font-sans",
  } as const;
  const titleFont = recreated
    ? displayStyles[recipe.typography.display]
    : event.fontPairKey === "fraunces-geist" ? "font-[family-name:var(--font-fraunces)]" : "font-sans";
  const bodyFont = recipe.typography.body === "classic-serif" ? "font-[family-name:var(--font-fraunces)]" : "font-sans";
  const alignment = recipe.composition.alignment === "center" ? "text-center" : "text-left";
  const rhythm = recipe.composition.rhythm === "compact" ? "mt-8 sm:mt-10" : recipe.composition.rhythm === "airy" ? "mt-16 sm:mt-24" : "mt-12 sm:mt-16";
  const radius = recipe.frame.radius === "rounded" ? "2rem" : recipe.frame.radius === "soft" ? "0.75rem" : "0";
  const frameStyle = recipe.frame.style === "double" || recipe.frame.style === "ornamental" ? "double" : recipe.frame.style === "none" ? "none" : "solid";
  const framedSurface = {
    backgroundColor: recipe.palette.surface,
    borderColor: recipe.palette.accent,
    borderStyle: frameStyle,
    borderWidth: recipe.frame.style === "none" ? 0 : Math.max(recipe.frame.width, frameStyle === "double" ? 3 : 1),
    borderRadius: radius,
  } as CSSProperties;
  const sectionOrder = (key: typeof recipe.contentOrder[number]) => {
    const position = recipe.contentOrder.indexOf(key);
    return position < 0 ? 99 : position;
  };
  const variables = {
    "--invitation-primary": recipe.palette.text,
    "--invitation-accent": recipe.palette.accent,
    backgroundColor: recipe.palette.background,
    color: recipe.palette.text,
  } as CSSProperties;
  const date = event.startsAt
    ? new Intl.DateTimeFormat(event.locale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: event.timezone,
      }).format(new Date(event.startsAt))
    : t("datePending");
  const rsvpDeadlineDate = event.rsvpDeadline
    ? new Intl.DateTimeFormat(event.locale, {
        dateStyle: "long",
        timeZone: event.timezone,
      }).format(new Date(event.rsvpDeadline))
    : null;
  const calendarInput: EventCalendarInput | null = event.startsAt ? {
    uid: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    location: [event.venueName, event.address].filter(Boolean).join(", "),
    description: event.description,
  } : null;
  const travelInfo = event.travelInfo ?? { airports: [], hotels: [] };
  const hasTravelInfo = travelInfo.airports.length > 0 || travelInfo.hotels.length > 0;
  const hotels = [...travelInfo.hotels].sort((left, right) => Number(right.recommended) - Number(left.recommended));
  const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-current px-5 py-2.5 text-sm font-semibold outline-none transition-[transform,background-color] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none";

  return (
    <main
      data-invitation-theme={event.themeKey}
      data-invitation-layout={event.designRecipe?.composition.family ?? theme.layout}
      className={`min-h-screen overflow-x-hidden pb-24 sm:pb-28 ${bodyFont} ${theme.page}`}
      style={variables}
    >
      <InvitationHero coverUrl={media.cover?.url ?? null} title={event.title} honoreeNames={event.honoreeNames} date={date} venueName={event.venueName} venueUrl={event.venueUrl} recipe={recipe} />
      <article id="invitation-content" className={`${recreated ? "mx-auto flex flex-col px-4 py-8 sm:px-8 sm:py-14" : theme.stage}`} style={recreated ? { maxWidth: recipe.composition.maxWidth } : undefined}>

        {event.description && (
          <section className={`${recreated ? alignment : theme.message} mt-8 sm:mt-12`} style={{ order: sectionOrder("intro") }}>
            <p className={`${titleFont} text-2xl leading-10 sm:text-3xl sm:leading-[1.55]`}>{event.description}</p>
          </section>
        )}

        <section className={`${recreated ? "" : theme.details} ${rhythm} px-5 py-8 sm:px-9`} style={{ ...(recreated ? framedSurface : {}), order: sectionOrder("details") }} aria-labelledby="invitation-details-heading">
          <h2 id="invitation-details-heading" className={`${titleFont} text-3xl`}>{t("details")}</h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0" />
              <div>
                <p className="font-semibold">{t("when")}</p>
                <p className="mt-1 leading-7 opacity-80">{date}</p>
                {rsvpDeadlineDate && <p className="mt-2 text-sm font-semibold">{state === "rsvp_closed" ? t("rsvpDeadlineClosed") : t("rsvpDeadline", { date: rsvpDeadlineDate })}</p>}
              </div>
            </div>
            {(event.venueName || event.address) && (
              <div className="flex gap-3">
                <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0" />
                <div><p className="font-semibold">{t("where")}</p>{event.venueName && (event.venueUrl ? <a href={event.venueUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-11 py-2 font-semibold underline decoration-1 underline-offset-4">{event.venueName}</a> : <p className="mt-1 leading-7">{event.venueName}</p>)}{event.address && <p className="leading-7 opacity-80">{event.address}</p>}</div>
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {event.mapUrl && <a href={event.mapUrl} target="_blank" rel="noreferrer" className={actionClass}><Navigation aria-hidden="true" className="size-4" />{t("openMap")}</a>}
            {calendarInput && <a href={googleEventCalendarUrl(calendarInput)} target="_blank" rel="noreferrer" className={actionClass}><CalendarDays aria-hidden="true" className="size-4" />{t("googleCalendar")}</a>}
            {calendarInput && <a href={eventIcsDataUrl(calendarInput)} download={`${event.slug}.ics`} className={actionClass}><Clock3 aria-hidden="true" className="size-4" />{t("downloadCalendar")}</a>}
          </div>
        </section>

        {event.styleGuide && <div className={`${rhythm}`} style={{ order: sectionOrder("details") + 0.25 }}><InvitationStyleGuide guide={event.styleGuide} titleClass={titleFont} accent={recipe.palette.accent} surface={recipe.palette.surface} /></div>}

        {(event.additionalSections ?? []).map((section, index) => (
          <section
            key={`${section.heading}:${index}`}
            className={`${recreated ? "" : theme.details} ${rhythm} px-5 py-8 sm:px-9`}
            style={{ ...(recreated ? framedSurface : {}), order: sectionOrder("details") + 0.3 + index / 100 }}
          >
            <h2 className={`${titleFont} text-3xl sm:text-4xl`}>{section.heading}</h2>
            <p className="mt-5 leading-8 opacity-85">
              {section.content.split("\n").map((line, lineIndex) => (
                <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{line}</Fragment>
              ))}
            </p>
          </section>
        ))}

        {hasTravelInfo && (
          <section className={`${recreated ? "" : theme.details} ${rhythm} px-5 py-8 sm:px-9`} style={{ ...(recreated ? framedSurface : {}), order: sectionOrder("details") + 0.5 }} aria-labelledby="invitation-travel-heading">
            <h2 id="invitation-travel-heading" className={`${titleFont} text-3xl sm:text-4xl`}>{t("travel.title")}</h2>
            <div className="mt-7 grid gap-9 md:grid-cols-2">
              {travelInfo.airports.length > 0 && (
                <div>
                  <h3 className={`${titleFont} flex items-center gap-3 text-2xl`}><Plane aria-hidden="true" className="size-5" style={{ color: recipe.palette.accent }} />{t("travel.airports")}</h3>
                  <div className="mt-4 divide-y" style={{ borderColor: recipe.palette.accent }}>
                    {travelInfo.airports.map((airport) => (
                      <article key={`${airport.name}:${airport.directionsUrl ?? ""}`} className="py-4 first:pt-0">
                        <p className="font-semibold">{airport.name}</p>
                        {airport.note && <p className="mt-1 text-sm leading-6 opacity-75">{airport.note}</p>}
                        {airport.directionsUrl && <a href={airport.directionsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-1 underline-offset-4"><Navigation aria-hidden="true" className="size-4" />{t("travel.directions")}</a>}
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {hotels.length > 0 && (
                <div>
                  <h3 className={`${titleFont} flex items-center gap-3 text-2xl`}><Building2 aria-hidden="true" className="size-5" style={{ color: recipe.palette.accent }} />{t("travel.hotels")}</h3>
                  <div className="mt-4 space-y-3">
                    {hotels.map((hotel) => (
                      <article key={`${hotel.name}:${hotel.address}`} className="relative border px-4 py-4" style={{ borderColor: recipe.palette.accent, borderWidth: hotel.recommended ? 2 : 1, backgroundColor: recipe.palette.surface }}>
                        {hotel.recommended && <span className="mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: recipe.palette.accent, color: readableTextColor(recipe.palette.accent) }}>{t("travel.recommended")}</span>}
                        <p className="font-semibold">{hotel.name}</p>
                        <p className="mt-1 text-sm leading-6 opacity-75">{hotel.address}</p>
                        <a href={hotelMapUrl(hotel.address)} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-1 underline-offset-4"><MapPin aria-hidden="true" className="size-4" />{t("travel.map")}</a>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {(media.gallery.length > 0 || media.video) && (
          <section className={`${recreated ? "" : theme.media} ${rhythm}`} style={{ order: sectionOrder("gallery") }} aria-labelledby="invitation-gallery-heading">
            <h2 id="invitation-gallery-heading" className={`${titleFont} text-3xl sm:text-4xl`}>{t("gallery")}</h2>
            {media.gallery.length > 0 && <div data-invitation-gallery="true" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">{media.gallery.map((item, index) => {
              const fillsLastRow = media.gallery.length % 2 === 1 && index === media.gallery.length - 1;
              return <InvitationImage key={item.id ?? item.path} src={item.url} alt={item.altText || t("galleryAlt", { number: index + 1 })} className={`aspect-[4/5] ${fillsLastRow ? "sm:col-span-2 sm:aspect-[16/9]" : ""}`} />;
            })}</div>}
            {media.video && <video controls preload="metadata" className="mt-6 aspect-video w-full bg-black" aria-label={t("videoLabel")}><source src={media.video.url} /></video>}
          </section>
        )}

        {event.showPublicRsvpCount && <div style={{ order: sectionOrder("counts") }}><PublicRsvpAggregate summary={rsvpSummary} titleClass={titleFont} className={`${recreated ? "" : theme.count} ${rhythm}`} /></div>}

      </article>
      {event.commentWallEnabled && <InvitationCommentWall slug={event.slug} initialPage={initialComments} preview={preview} accent={recipe.palette.accent} surface={recipe.palette.surface} foreground={recipe.palette.text} titleClass={titleFont} />}
      <InvitationFooter />
      <InvitationRsvpDialog slug={event.slug} state={state} preview={preview} deadlineDate={rsvpDeadlineDate} showPublicRsvpCount={event.showPublicRsvpCount} accent={recipe.palette.accent} background={recipe.palette.surface} foreground={recipe.palette.text} />
    </main>
  );
}
