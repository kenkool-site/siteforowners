"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatDuration } from "@/lib/availability";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import type { BookingModePolicy } from "@/lib/admin-auth";
import {
  MAISON_AUTOPLAY_MS,
  MAISON_MOBILE_QUERY,
  MAISON_RESUME_COOLDOWN_MS,
  activeIndexFromScroll,
  assignServiceCardImages,
  nextCarouselIndex,
  orderMaisonServices,
  shouldAdvanceCarousel,
  type MaisonPalette,
  type MaisonService,
} from "./maison-content";

type Copy = {
  serviceEdit: string;
  signatureLook: string;
  signatureLookEm: string;
  fullMenu: string;
  servicesWord: string;
  serviceWord: string;
  findAppointment: string;
  exploreLooks: string;
  pauseCarousel: string;
  resumeCarousel: string;
  viewService: string;
};

interface MaisonServicesProps {
  services: MaisonService[];
  galleryImages: string[];
  intro?: string;
  palette: MaisonPalette;
  bookingMode: BookingModePolicy;
  showBooking: boolean;
  copy: Copy;
  indexLabel: string;
  serif: CSSProperties;
}

function canBookService(service: MaisonService, bookingMode: BookingModePolicy): boolean {
  return !(bookingMode === "external_only" && !service.bookingDeepLink);
}

function bookService(service: MaisonService, bookingMode: BookingModePolicy) {
  if (!canBookService(service, bookingMode)) return;
  if (bookingMode === "external_only" && service.bookingDeepLink) {
    window.open(service.bookingDeepLink, "_blank", "noopener,noreferrer");
    return;
  }
  if (bookingMode === "both" && service.bookingDeepLink) {
    requestBookingChoice(service.name, service.bookingDeepLink);
    return;
  }
  openBookingCalendarForService(service.name);
}

export function MaisonServices({
  services,
  galleryImages,
  intro,
  palette,
  bookingMode,
  showBooking,
  copy,
  indexLabel,
  serif,
}: MaisonServicesProps) {
  const ordered = orderMaisonServices(services);
  const images = assignServiceCardImages(ordered, galleryImages);
  const count = ordered.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeRef = useRef(0);
  const stateRef = useRef({
    isMobile: false,
    reducedMotion: false,
    inView: false,
    userPaused: false,
    hovered: false,
    touching: false,
    focused: false,
    resumeAfter: 0,
  });

  useEffect(() => {
    stateRef.current.userPaused = userPaused;
  }, [userPaused]);

  useEffect(() => {
    const release = () => {
      if (!stateRef.current.touching) return;
      stateRef.current.touching = false;
      stateRef.current.resumeAfter = Date.now() + MAISON_RESUME_COOLDOWN_MS;
    };
    const onVisible = () => {
      if (!document.hidden) stateRef.current.resumeAfter = Date.now() + MAISON_RESUME_COOLDOWN_MS;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia(MAISON_MOBILE_QUERY);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      stateRef.current.isMobile = mobile.matches;
      stateRef.current.reducedMotion = motion.matches;
      setReducedMotion(motion.matches);
    };
    sync();
    mobile.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      mobile.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        stateRef.current.inView = entries[0]?.isIntersecting ?? false;
      },
      { threshold: 0.35 },
    );
    observer.observe(track);
    return () => observer.disconnect();
  }, [count]);

  const pauseBriefly = () => {
    stateRef.current.resumeAfter = Date.now() + MAISON_RESUME_COOLDOWN_MS;
  };

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    const first = track?.children[0] as HTMLElement | undefined;
    if (!track || !card || !first) return;
    track.scrollTo({
      left: card.offsetLeft - first.offsetLeft,
      behavior: stateRef.current.reducedMotion ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (
        !shouldAdvanceCarousel({
          ...current,
          documentHidden: document.hidden,
          now: Date.now(),
          count,
        })
      ) {
        return;
      }
      scrollToIndex(nextCarouselIndex(activeRef.current, count));
    }, MAISON_AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [count]);

  const onTrackScroll = () => {
    const track = trackRef.current;
    if (!track || track.children.length < 2) return;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    const index = activeIndexFromScroll(
      track.scrollLeft,
      second.offsetLeft - first.offsetLeft,
      track.children.length,
    );
    if (index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
  };

  if (count === 0) return null;

  const countLabel = `${count < 10 ? String(count).padStart(2, "0") : count} ${
    count === 1 ? copy.serviceWord : copy.servicesWord
  }`;

  return (
    <section id="services" className="mx-auto max-w-[1180px] px-6 py-16 md:px-11 md:py-24" aria-labelledby="maison-services-title">
      <div className="mb-8 flex flex-col gap-4 md:mb-11 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: palette.gold }}>
            {indexLabel} / {copy.serviceEdit}
          </p>
          <h2 id="maison-services-title" className="text-[2.7rem] leading-none tracking-[-0.03em] md:text-[3.6rem]" style={serif}>
            {copy.signatureLook}
            <br />
            <em className="italic">{copy.signatureLookEm}</em>
          </h2>
        </div>
        {intro ? (
          <p className="max-w-[18rem] text-xs leading-relaxed opacity-70 md:text-right">{intro}</p>
        ) : null}
      </div>

      <div
        ref={trackRef}
        className="maison-track -mx-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-6 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-x-5 md:gap-y-6 md:overflow-visible md:px-0 md:pb-0"
        role="region"
        aria-roledescription="carousel"
        aria-label={copy.exploreLooks}
        tabIndex={0}
        onScroll={onTrackScroll}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") stateRef.current.hovered = true;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            stateRef.current.hovered = false;
            pauseBriefly();
          }
        }}
        onPointerDown={() => {
          stateRef.current.touching = true;
          pauseBriefly();
        }}
        onPointerUp={() => {
          stateRef.current.touching = false;
          pauseBriefly();
        }}
        onPointerCancel={() => {
          stateRef.current.touching = false;
          pauseBriefly();
        }}
        onFocus={() => {
          stateRef.current.focused = true;
        }}
        onBlur={() => {
          stateRef.current.focused = false;
          pauseBriefly();
        }}
      >
        {ordered.map((service, index) => {
          const image = images[index];
          const duration = formatDuration(service.durationMinutes ?? 60);
          const bookable = canBookService(service, bookingMode);
          const label = bookable
            ? `${service.name}, ${service.price}, ${duration}`
            : `${service.name}, ${service.price}`;
          const inner = (
            <>
              {image ? (
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 767px) 86vw, 33vw"
                  className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.03]"
                  unoptimized
                />
              ) : null}
              <span
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 33%, rgba(15,20,13,0.08) 47%, rgba(15,20,13,0.67) 73%, rgba(15,20,13,0.96) 100%)",
                }}
              />
              <span className="absolute inset-x-0 bottom-0 p-5 text-[#fbf7ef] md:p-6">
                <span className="block max-w-[16rem] text-[1.7rem] leading-[1.05] tracking-[-0.02em] md:text-[1.85rem]" style={serif}>
                  {service.name}
                </span>
                {service.description ? (
                  <span className="mt-2 line-clamp-2 hidden max-w-[16rem] text-[11px] leading-relaxed text-white/80 md:block">
                    {service.description}
                  </span>
                ) : null}
                <span
                  className="mt-4 flex items-center justify-between gap-3 border-t pt-3"
                  style={{ borderColor: "color-mix(in srgb, white 42%, transparent)" }}
                >
                  <span className="text-[1.55rem] leading-none" style={serif}>
                    {service.price}
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#eee8dc]">
                    {duration}
                  </span>
                </span>
              </span>
            </>
          );
          const className =
            "group relative aspect-[4/5] w-[86%] shrink-0 snap-start overflow-hidden border text-left md:w-auto";
          const style = { borderColor: `color-mix(in srgb, ${palette.gold} 62%, #b8a580)`, backgroundColor: "#292c27" };
          if (!bookable) {
            return (
              <article key={`${service.name}-${index}`} className={className} style={style} aria-label={label} data-service-card={index}>
                {inner}
              </article>
            );
          }
          return (
            <button
              key={`${service.name}-${index}`}
              type="button"
              className={className}
              style={style}
              aria-label={label}
              data-service-card={index}
              onClick={() => bookService(service, bookingMode)}
            >
              {inner}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-[8px] font-semibold uppercase tracking-[0.14em] md:hidden" style={{ color: palette.ink }}>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap opacity-70">
          <span>{copy.exploreLooks}</span>
          {reducedMotion ? null : (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center text-sm tracking-normal"
              aria-pressed={userPaused}
              aria-label={userPaused ? copy.resumeCarousel : copy.pauseCarousel}
              onClick={() => setUserPaused((paused) => !paused)}
            >
              {userPaused ? "▷" : "Ⅱ"}
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end" role="tablist" aria-label={copy.exploreLooks}>
          {ordered.map((service, index) => (
            <button
              key={`${service.name}-dot`}
              type="button"
              className="inline-flex h-8 w-4 shrink-0 items-center justify-center"
              aria-label={`${copy.viewService} ${index + 1}`}
              aria-current={index === active}
              onClick={() => {
                pauseBriefly();
                scrollToIndex(index);
              }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: index === active ? 6 : 4,
                  height: index === active ? 6 : 4,
                  backgroundColor: index === active ? palette.gold : `color-mix(in srgb, ${palette.ink} 28%, ${palette.paper})`,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 md:hidden" data-full-service-list>
        <div className="mb-2 flex items-end justify-between gap-3">
          <h3 className="text-[1.8rem] leading-none" style={serif}>
            {copy.fullMenu}
          </h3>
          <span className="text-[8px] font-semibold uppercase tracking-[0.16em] opacity-60">{countLabel}</span>
        </div>
        <ul>
          {ordered.map((service, index) => {
            const duration = formatDuration(service.durationMinutes ?? 60);
            const bookable = canBookService(service, bookingMode);
            const row = (
              <>
                <span className="min-w-0 max-w-[68%]">
                  <span className="block text-[1.3rem] leading-tight" style={serif}>
                    {service.name}
                  </span>
                  {service.description ? (
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-snug opacity-65">
                      {service.description}
                    </span>
                  ) : null}
                </span>
                <span className="mx-2 mb-1 h-px min-w-2 flex-1 self-center border-b border-dotted" style={{ borderColor: `color-mix(in srgb, ${palette.gold} 45%, ${palette.line})` }} />
                <span className="shrink-0 text-right">
                  <span className="block text-[1.3rem] leading-none" style={serif}>
                    {service.price}
                  </span>
                  <span className="mt-1.5 block text-[8px] font-semibold uppercase tracking-[0.14em] opacity-60">
                    {duration}
                  </span>
                </span>
              </>
            );
            return (
              <li key={`${service.name}-row-${index}`} className="border-t" style={{ borderColor: palette.line }}>
                {bookable ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-3.5 text-left"
                    onClick={() => bookService(service, bookingMode)}
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 py-3.5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t" style={{ borderColor: palette.line }} />
      </div>

      {showBooking ? (
        <div className="mt-6 flex justify-start md:justify-end">
          <a
            href="#booking"
            className="border-b pb-1 text-[9px] font-semibold uppercase tracking-[0.16em]"
            style={{ borderColor: palette.gold }}
          >
            {copy.findAppointment} ↗
          </a>
        </div>
      ) : null}
    </section>
  );
}
