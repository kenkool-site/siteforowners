"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Building2, CalendarDays, Clock3, MapPin, Navigation, Plane } from "lucide-react";
import {
  eventIcsDataUrl,
  googleEventCalendarUrl,
  type EventCalendarInput,
} from "@/lib/invitations/calendar";
import { InvitationRsvpDialog } from "./InvitationRsvpDialog";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";
import { hotelMapUrl } from "@/lib/invitations/travel";
import { InvitationHero } from "./InvitationHero";
import { InvitationFooter } from "./InvitationFooter";
import { InvitationStyleGuide } from "./InvitationStyleGuide";
import type { EffectiveEventState } from "@/lib/invitations/state";
import type { PublicInvitationEvent as RepositoryPublicInvitationEvent } from "@/lib/invitations/repository-core";
import type { InvitationCommentPage } from "@/lib/invitations/comments";
import { InvitationCommentWall } from "./InvitationCommentWall";
import {
  countdownParts,
  directionsHref,
  eventKind,
  eventPhase,
  formatEventDay,
  formatEventTime,
  formatEventWhen,
  memoriesPath,
  untilDateLabel,
  type CountdownParts,
} from "@/lib/invitations/event-site";
import { eventDisplayClass } from "./event-display";

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
  initialMedia?: InvitationMediaSnapshot;
  rsvpSummary: { attendingPeople: number; declinedParties: number };
  initialComments?: InvitationCommentPage;
  /** Server render time. The clock ticks after hydration so the markup matches. */
  nowIso?: string;
  /** Keep the supplied instant. The public page lets the clock tick after hydration. */
  freezeClock?: boolean;
  brandingEnabled?: boolean;
  rsvpStartsOpen?: boolean;
  rsvpInitialSuccess?: { name: string; attending: boolean } | null;
};

const GREEN = "#1A3D24";
const PAPER = "#FBF8F2";
const INK = "#14261A";

function comparableHeading(value: string): string {
  return value.toLocaleLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function useEventClock(nowIso?: string, freeze = false): number | null {
  const seeded = nowIso && Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : null;
  const [now, setNow] = useState<number | null>(seeded);
  useEffect(() => {
    if (freeze) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [freeze]);
  return now;
}

function InvitationImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const frame = `relative w-full ${className ?? ""}`;
  if (src.startsWith("/api/invitations/public/")) {
    return (
      <div className={frame}>
        <Image src={src} alt={alt} fill priority={priority} className="object-cover" sizes="(max-width: 768px) 100vw, 768px" />
      </div>
    );
  }
  return (
    <div className={frame}>
      {/* Signed gallery URLs change on every fetch, so next/image cannot cache them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#B3945C]">{children}</p>;
}

function CountdownCard({ parts, until, pendingLabel }: { parts: CountdownParts | null; until: string | null; pendingLabel: string }) {
  const t = useTranslations("invitations.public.countdown");
  const cells = parts
    ? [
        [parts.days, t("days"), false],
        [parts.hours, t("hours"), true],
        [parts.minutes, t("minutes"), true],
        [parts.seconds, t("seconds"), true],
      ] as const
    : [];
  return (
    <section
      data-countdown={parts ? "live" : "pending"}
      aria-busy={parts ? undefined : true}
      aria-label={t("label")}
      className="relative z-[2] mx-auto -mt-10 w-[calc(100%-2.5rem)] max-w-lg border border-[#E4DCCE] bg-[#FBF8F2] px-3.5 py-4 text-center shadow-[0_16px_40px_rgba(20,38,26,.12)]"
    >
      <Kicker>{t("label")}</Kicker>
      {parts ? (
        <div className="mt-2.5 grid grid-cols-4">
          {cells.map(([value, label, pad], index) => (
            <div key={label} className={index > 0 ? "border-l border-[#E4DCCE]" : undefined}>
              <b className={`${eventDisplayClass} block text-4xl font-medium leading-none text-[#1A3D24]`}>{pad ? String(value).padStart(2, "0") : String(value)}</b>
              <small className="mt-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-[#5E6F61]">{label}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-sm text-[#5E6F61]">{pendingLabel}</p>
      )}
      {until && <p className="mt-2.5 text-[11px] text-[#5E6F61]">{t("until", { date: until })}</p>}
    </section>
  );
}

export function StateView({ children }: { children: ReactNode }) {
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
      <p className={`${titleClass} text-[3.5rem] font-medium leading-none text-[#1A3D24]`}>{summary.attendingPeople}</p>
      <p className={`${eventDisplayClass} mt-1.5 text-xl italic text-[#14261A]`}>{t("celebrating", { count: summary.attendingPeople })}</p>
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

const ghostButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#1A3D24] px-3 py-2 text-[13.5px] font-medium text-[#1A3D24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]";
const solidButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1A3D24] px-3 py-2 text-[13.5px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24] focus-visible:ring-offset-2";

export function PublicInvitation({
  event,
  state,
  initialMedia,
  rsvpSummary,
  preview = false,
  initialComments = { comments: [], nextCursor: null },
  nowIso,
  freezeClock = false,
  brandingEnabled = true,
  rsvpStartsOpen = false,
  rsvpInitialSuccess = null,
}: PublicInvitationProps) {
  const t = useTranslations("invitations.public");
  const clock = useEventClock(nowIso, freezeClock);
  const phase = clock == null ? (event.startsAt ? "upcoming" : "undated") : eventPhase(event.startsAt, new Date(clock));
  const parts = clock == null || phase !== "upcoming" ? null : countdownParts(event.startsAt, new Date(clock));

  const [media, setMedia] = useState<InvitationMediaSnapshot | null>(initialMedia ?? null);
  useEffect(() => {
    if (initialMedia) return;
    let cancelled = false;
    fetch(`/api/invitations/public/${encodeURIComponent(event.slug)}/media`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setMedia(data); })
      .catch(() => { if (!cancelled) setMedia(null); });
    return () => { cancelled = true; };
  }, [event.slug, initialMedia]);

  const names = event.honoreeNames.trim() || event.title;
  const supportingTitle = comparableHeading(event.title) !== comparableHeading(names) ? event.title : "";
  const whenLabel = formatEventWhen(event.startsAt, event.timezone, event.locale);
  const dayLabel = formatEventDay(event.startsAt, event.timezone, event.locale);
  const until = untilDateLabel(event.startsAt, event.timezone, event.locale);
  const thanksDay = formatEventDay(event.startsAt, event.timezone, event.locale);
  const rsvpDeadlineDate = event.rsvpDeadline
    ? new Intl.DateTimeFormat(event.locale, { dateStyle: "long", timeZone: event.timezone }).format(new Date(event.rsvpDeadline))
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
  const googleHref = calendarInput ? googleEventCalendarUrl(calendarInput) : null;
  const icsHref = calendarInput ? eventIcsDataUrl(calendarInput) : null;
  const travelInfo = event.travelInfo ?? { airports: [], hotels: [] };
  const hasTravelInfo = travelInfo.airports.length > 0 || travelInfo.hotels.length > 0;
  const hotels = [...travelInfo.hotels].sort((left, right) => Number(right.recommended) - Number(left.recommended));
  const schedule = event.eventSchedule ?? [];
  const hasVenue = Boolean(event.venueName || event.address || event.venueUrl || event.mapUrl);
  const directions = directionsHref(event.address, event.mapUrl);
  const gallery = media?.gallery ?? [];
  const welcomePhotos = gallery.slice(0, 2);
  const dressPhoto = gallery.length > 2 ? gallery[gallery.length - 1] : null;
  const memoriesHref = memoriesPath(event.slug);
  const closed = state === "rsvp_closed";

  return (
    <main
      data-invitation-theme={event.themeKey}
      data-invitation-layout="luxury"
      data-invitation-phase={phase}
      className="min-h-screen overflow-x-hidden bg-[#F3EEE4] text-[#14261A]"
    >
      <InvitationHero
        coverUrl={media?.cover?.url ?? null}
        coverAlt={t("coverAlt", { title: names })}
        honoreeNames={names}
        whenLabel={phase === "thanks" ? thanksDay : whenLabel}
        venueLine={event.venueName || event.address}
        eyebrow={t(`eyebrow.${eventKind(event.eventType)}`)}
        supportingTitle={supportingTitle}
        phase={phase === "thanks" ? "thanks" : "upcoming"}
        thanksTitle={t("thanks.title")}
        thanksBody={t("thanks.arrived", { names })}
        thanksAction={t("thanks.memories")}
        memoriesHref={memoriesHref}
      />

      <article id="invitation-content" className="mx-auto max-w-lg pb-8">
        {phase !== "thanks" && event.startsAt && (
          <CountdownCard parts={parts} until={until} pendingLabel={t("countdown.pending")} />
        )}

        {event.description && (
          <section id="invitation-welcome" className="px-6 pb-2 pt-9 text-center" aria-labelledby="invitation-welcome-heading">
            <Kicker>{t("welcome.kicker")}</Kicker>
            <div aria-hidden="true" className="mx-auto mt-3.5 h-px w-10 bg-[#B3945C]" />
            <h2 id="invitation-welcome-heading" className="sr-only">{t("welcome.kicker")}</h2>
            <p className={`${eventDisplayClass} mt-4 text-[1.3rem] italic leading-snug`}>{event.description}</p>
          </section>
        )}

        {welcomePhotos.length > 0 && (
          <div className="mt-6 space-y-3.5">
            {welcomePhotos.map((item, index) => (
              <figure key={item.id ?? item.path} className="px-6">
                <InvitationImage src={item.url} alt={item.altText || t("galleryAlt", { number: index + 1 })} className={index === 0 ? "aspect-[4/5]" : "aspect-[16/9]"} />
              </figure>
            ))}
            <p className="px-6 text-center text-[11px] uppercase tracking-[0.08em] text-[#5E6F61]">{t("welcome.photos")}</p>
          </div>
        )}

        <section id="invitation-schedule" className="px-6 pb-2 pt-9" aria-labelledby={schedule.length > 0 ? "invitation-schedule-heading" : undefined}>
          {schedule.length > 0 && (
            <>
              <Kicker>{t("eventSchedule.kicker")}</Kicker>
              <h2 id="invitation-schedule-heading" className={`${eventDisplayClass} mt-2 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("eventSchedule.title")}</h2>
              {dayLabel && <p className="mt-2 text-xs text-[#5E6F61]">{dayLabel}</p>}
            </>
          )}
          {schedule.length > 0 && (
            <div className="relative mt-4 pl-7">
              <div className="absolute bottom-1 left-[5px] top-1 w-px bg-[#D4C2A0]" />
              {schedule.map((item, index) => (
                <div key={`${item.name}:${index}`} className="relative pb-6 last:pb-0">
                  <div className="absolute -left-7 top-1.5 size-2.5 rounded-full bg-[#1A3D24] shadow-[0_0_0_3px_#F3EEE4]" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#B3945C]">
                    {formatEventTime(item.startsAt, event.timezone, event.locale)}
                  </p>
                  <p className={`${eventDisplayClass} mt-0.5 text-[1.35rem] font-semibold`}>{item.name}</p>
                  {(item.locationName || item.locationAddress) && (
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] text-[#5E6F61]">
                      <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      <span>{[item.locationName, item.locationAddress].filter(Boolean).join(" — ")}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {calendarInput && googleHref && icsHref && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a href={googleHref} target="_blank" rel="noreferrer" className={ghostButton}><CalendarDays aria-hidden="true" className="size-4" />{t("googleCalendar")}</a>
              <a href={icsHref} download={`${event.slug}.ics`} className={ghostButton}><Clock3 aria-hidden="true" className="size-4" />{t("downloadCalendar")}</a>
            </div>
          )}
          <div className="mt-4">
            {state === "published" && rsvpDeadlineDate && <p className="text-sm font-medium text-[#1A3D24]">{t("rsvpDeadline", { date: rsvpDeadlineDate })}</p>}
            {closed && <p className="text-xs text-[#5E6F61]"><span className="inline-flex items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]">{t("rsvpDeadlineClosed")}</span></p>}
          </div>
        </section>

        <div className="pb-4 pt-2">
          <InvitationRsvpDialog
            slug={event.slug}
            state={state}
            preview={preview}
            deadlineDate={rsvpDeadlineDate}
            showPublicRsvpCount={event.showPublicRsvpCount}
            accent={GREEN}
            background={PAPER}
            foreground={INK}
            whenLabel={whenLabel}
            googleCalendarUrl={googleHref}
            icsHref={icsHref}
            icsFilename={`${event.slug}.ics`}
            memoriesHref={memoriesHref}
            brandingEnabled={brandingEnabled}
            initialSuccess={rsvpInitialSuccess}
            defaultOpen={rsvpStartsOpen}
          />
        </div>

        {hasVenue && (
          <section id="invitation-venue" className="px-6 py-8" aria-labelledby="invitation-venue-heading">
            <Kicker>{t("where")}</Kicker>
            <h2 id="invitation-venue-heading" className={`${eventDisplayClass} mt-2 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{event.venueName || t("where")}</h2>
            <div className="mt-4 overflow-hidden border border-[#E4DCCE] bg-[#FBF8F2]">
              <div className="relative h-36 bg-[#dce6db]" aria-hidden="true">
                <svg viewBox="0 0 360 150" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                  <rect width="360" height="150" fill="#dce6db" />
                  <path d="M0 110 C60 90 90 130 150 100 C200 80 240 120 360 85 L360 150 L0 150Z" fill="#c9d6c6" />
                  <circle cx="214" cy="72" r="7" fill="#1A3D24" />
                  <circle cx="214" cy="72" r="14" fill="none" stroke="#1A3D24" strokeWidth="1.5" opacity="0.35" />
                </svg>
              </div>
              <div className="px-4 py-4">
                {event.venueName && <h3 className={`${eventDisplayClass} text-[1.35rem] font-semibold text-[#1A3D24]`}>{event.venueName}</h3>}
                {event.address && <p className="mt-1 text-[13px] text-[#5E6F61]">{event.address}</p>}
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  {directions && <a href={directions} target="_blank" rel="noreferrer" className={solidButton}><Navigation aria-hidden="true" className="size-4" />{t("venue.directions")}</a>}
                  {event.venueUrl && <a href={event.venueUrl} target="_blank" rel="noreferrer" className={ghostButton}>{t("venue.website")}</a>}
                </div>
              </div>
            </div>
          </section>
        )}

        {event.styleGuide && (
          <>
            <InvitationStyleGuide guide={event.styleGuide} titleClass={eventDisplayClass} />
            {dressPhoto && (
              <figure className="px-6 pb-6">
                <InvitationImage src={dressPhoto.url} alt={dressPhoto.altText || t("galleryAlt", { number: gallery.length })} className="aspect-[16/9]" />
              </figure>
            )}
          </>
        )}

        {(event.additionalSections ?? []).map((section, index) => (
          <section key={`${section.heading}:${index}`} className="px-6 py-8">
            <h2 className={`${eventDisplayClass} text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{section.heading}</h2>
            <p className="mt-4 leading-7 text-[#14261A]">
              {section.content.split("\n").map((line, lineIndex) => (
                <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{line}</Fragment>
              ))}
            </p>
          </section>
        ))}

        {hasTravelInfo && (
          <section id="invitation-travel" className="px-6 py-8" aria-labelledby="invitation-travel-heading">
            <Kicker>{t("travel.kicker")}</Kicker>
            <h2 id="invitation-travel-heading" className={`${eventDisplayClass} mt-2 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("travel.heading")}</h2>
            {travelInfo.airports.length > 0 && (
              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-xs text-[#5E6F61]"><Plane aria-hidden="true" className="size-4 text-[#1A3D24]" />{t("travel.airports")}</h3>
                <div className="mt-2 divide-y divide-[#E4DCCE]">
                  {travelInfo.airports.map((airport) => (
                    <article key={`${airport.name}:${airport.directionsUrl ?? ""}`} className="py-3">
                      <p className="font-medium">{airport.name}</p>
                      {airport.note && <p className="mt-1 text-[12.5px] text-[#5E6F61]">{airport.note}</p>}
                      {airport.directionsUrl && <a href={airport.directionsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#1A3D24] underline decoration-1 underline-offset-4"><Navigation aria-hidden="true" className="size-4" />{t("travel.directions")}</a>}
                    </article>
                  ))}
                </div>
              </div>
            )}
            {hotels.length > 0 && (
              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-xs text-[#5E6F61]"><Building2 aria-hidden="true" className="size-4 text-[#1A3D24]" />{t("travel.hotels")}</h3>
                <div className="mt-2 space-y-2.5">
                  {hotels.map((hotel) => (
                    <article key={`${hotel.name}:${hotel.address}`} className="border bg-[#FBF8F2] px-3.5 py-3.5" style={{ borderColor: hotel.recommended ? "#B3945C" : "#E4DCCE" }}>
                      {hotel.recommended && <span className="mb-1.5 inline-flex rounded-full bg-[#1A3D24] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">{t("travel.recommended")}</span>}
                      <p className="font-medium">{hotel.name}</p>
                      <p className="mt-1 text-[12.5px] text-[#5E6F61]">{hotel.address}</p>
                      <a href={hotelMapUrl(hotel.address)} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#1A3D24]"><MapPin aria-hidden="true" className="size-4" />{t("travel.map")}</a>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {(gallery.length > 0 || media?.video) && (
          <section id="invitation-gallery" className="px-6 py-8" aria-labelledby="invitation-gallery-heading">
            <Kicker>{t("galleryKicker")}</Kicker>
            <h2 id="invitation-gallery-heading" className={`${eventDisplayClass} mt-2 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("gallery")}</h2>
            {gallery.length > 0 && (
              <div data-invitation-gallery="true" className="mt-4 grid grid-cols-2 gap-2">
                {gallery.map((item, index) => {
                  const lastIsWide = gallery.length > 1 && (gallery.length - 1) % 2 === 1 && index === gallery.length - 1;
                  const wide = index === 0 || lastIsWide;
                  return (
                    <InvitationImage
                      key={item.id ?? item.path}
                      src={item.url}
                      alt={item.altText || t("galleryAlt", { number: index + 1 })}
                      className={wide ? "col-span-2 aspect-[16/9]" : "aspect-[4/5]"}
                    />
                  );
                })}
              </div>
            )}
            {media?.video && <video controls preload="metadata" className="mt-4 aspect-video w-full bg-black" aria-label={t("videoLabel")}><source src={media.video.url} /></video>}
          </section>
        )}

        <a href={memoriesHref} className="mx-6 flex items-center gap-3 border border-[#E4DCCE] bg-[#FBF8F2] p-4">
          {brandingEnabled && <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#1A3D24] font-[family-name:var(--font-event-display)] text-base text-white">i</span>}
          <span>
            <span className="block text-sm font-medium">{t("galleryMemories")}</span>
            <span className="block text-xs text-[#5E6F61]">{t("galleryMemoriesHint")}</span>
          </span>
        </a>

        {event.showPublicRsvpCount && (
          <div id="invitation-guests">
            <PublicRsvpAggregate summary={rsvpSummary} titleClass={eventDisplayClass} className="mt-4" />
          </div>
        )}
      </article>

      {event.commentWallEnabled && (
        <InvitationCommentWall slug={event.slug} initialPage={initialComments} preview={preview} accent={GREEN} surface={PAPER} foreground={INK} titleClass={eventDisplayClass} honoreeNames={names} />
      )}

      <section className="mx-auto max-w-lg px-6 pt-10 text-center">
        <Kicker>{names}</Kicker>
        {dayLabel && <h2 className={`${eventDisplayClass} mt-2 text-[1.7rem] font-medium text-[#1A3D24]`}>{dayLabel}</h2>}
        {(event.venueName || event.address) && <p className="mt-1 text-xs text-[#5E6F61]">{event.venueName || event.address}</p>}
        {closed && <p className="mt-4"><span className="inline-flex items-center rounded-full border border-[#E4DCCE] bg-[#FBF8F2] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#5E6F61]">{t("rsvpDeadlineClosed")}</span></p>}
      </section>
      <InvitationFooter slug={event.slug} brandingEnabled={brandingEnabled} />
    </main>
  );
}
