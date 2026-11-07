"use client";

import Image from "next/image";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BusinessHours, BusinessType, SocialLinks } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import type { ThemeColors } from "@/lib/templates/themes";
import { resolveDisplayHours } from "@/lib/defaults/businessHours";
import { TemplateContact } from "../TemplateContact";
import { TemplateMap } from "../TemplateMap";
import { MaisonServices } from "./MaisonServices";
import {
  aboutSubject,
  formatPhoneDisplay,
  maisonPalette,
  placeName,
  signatureLine,
  splitBusinessName,
  type MaisonService,
} from "./maison-content";

const maisonSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-maison-serif",
});

const maisonSans = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-maison-sans",
});

const SERIF: CSSProperties = {
  fontFamily: "var(--font-maison-serif), Georgia, serif",
  fontWeight: 400,
};

const UI = {
  en: {
    openMenu: "Open menu",
    closeMenu: "Close menu",
    ownerLogin: "Owner login",
    services: "Services",
    selectedWork: "Selected work",
    about: "About",
    bookAppointment: "Book an appointment",
    contact: "Contact",
    products: "Products",
    findYourLook: "Find your look",
    explore: "Explore",
    bookNow: "Book now",
    fullMenu: "The full service menu",
    servicesWord: "services",
    serviceWord: "service",
    findAppointment: "Find an appointment",
    exploreLooks: "Explore the looks",
    pauseCarousel: "Pause automatic carousel",
    resumeCarousel: "Resume automatic carousel",
    viewService: "View service",
    theLocation: "The location",
    getInTouch: "Get in touch",
    hours: "Hours",
    closed: "Closed",
    seeYouIn: "See you in",
    seeYou: "See you soon.",
    serviceEdit: "The service edit",
    signatureLook: "Your next",
    signatureLookEm: "signature look.",
    galleryIntro: "A closer look at the finish.",
    everyAngle: "Every angle.",
    everyDetail: "Every detail.",
    behind: "Behind the work",
    bookingEyebrow: "Your time in the chair",
    bookingTitle: "A fresh look.",
    bookingTitleEm: "A moment for you.",
    bookingLead: "Choose your style and find your next appointment with",
    bookCta: "Book an appointment",
    watch: "Watch",
    inMotion: "In motion",
    look: "Look",
    poweredBy: "Powered by",
    text: "Text",
    language: "Language",
  },
  es: {
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    ownerLogin: "Entrar como dueño",
    services: "Servicios",
    selectedWork: "Trabajos",
    about: "Acerca de",
    bookAppointment: "Reservar una cita",
    contact: "Contacto",
    products: "Productos",
    findYourLook: "Encuentra tu estilo",
    explore: "Explorar",
    bookNow: "Reservar",
    fullMenu: "El menú completo",
    servicesWord: "servicios",
    serviceWord: "servicio",
    findAppointment: "Pedir una cita",
    exploreLooks: "Explora los estilos",
    pauseCarousel: "Pausar el carrusel",
    resumeCarousel: "Reanudar el carrusel",
    viewService: "Ver servicio",
    theLocation: "La ubicación",
    getInTouch: "Escríbenos",
    hours: "Horario",
    closed: "Cerrado",
    seeYouIn: "Te vemos en",
    seeYou: "Te vemos pronto.",
    serviceEdit: "La selección",
    signatureLook: "Tu próximo",
    signatureLookEm: "look.",
    galleryIntro: "Un vistazo más de cerca al acabado.",
    everyAngle: "Cada ángulo.",
    everyDetail: "Cada detalle.",
    behind: "Detrás del trabajo",
    bookingEyebrow: "Tu momento en la silla",
    bookingTitle: "Un look nuevo.",
    bookingTitleEm: "Un momento para ti.",
    bookingLead: "Elige tu estilo y reserva tu próxima cita con",
    bookCta: "Reservar una cita",
    watch: "Ver",
    inMotion: "En movimiento",
    look: "Look",
    poweredBy: "Con la tecnología de",
    text: "Texto",
    language: "Idioma",
  },
} as const;

const TYPE_LABEL: Record<"en" | "es", Record<BusinessType, string>> = {
  en: {
    salon: "Salon",
    barbershop: "Barbershop",
    restaurant: "Restaurant",
    nails: "Nails",
    braids: "Braids",
    locs: "Locs",
    locs_and_braids: "Locs & braids",
    home_services: "Home services",
  },
  es: {
    salon: "Salón",
    barbershop: "Barbería",
    restaurant: "Restaurante",
    nails: "Uñas",
    braids: "Trenzas",
    locs: "Locs",
    locs_and_braids: "Locs y trenzas",
    home_services: "Servicios del hogar",
  },
};

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type NavItem = { id: string; label: string };

export interface MaisonSiteProps {
  businessName: string;
  businessType: BusinessType;
  headline: string;
  subheadline: string;
  aboutParagraphs: string[];
  heroImage?: string;
  heroVideo?: string;
  galleryImages: string[];
  galleryVideoUrl?: string;
  galleryVideoTitle?: string;
  address?: string;
  phone?: string;
  hours?: BusinessHours;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  showHours: boolean;
  socialLinks?: SocialLinks | null;
  colors: ThemeColors;
  locale: "en" | "es";
  onLocaleChange: (locale: "en" | "es") => void;
  services: MaisonService[];
  bookingMode: BookingModePolicy;
  showServices: boolean;
  showGallery: boolean;
  showAbout: boolean;
  aboutImage?: string;
  showBooking: boolean;
  showContact: boolean;
  showMap: boolean;
  contactPreview: boolean;
  navItems: NavItem[];
  booking?: ReactNode;
  products?: ReactNode;
  proof?: ReactNode;
  footerTagline?: string;
}

function phoneHref(phone: string, kind: "tel" | "sms"): string | null {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  if (normalized.length < 11 || normalized.length > 15) return null;
  return `${kind}:+${normalized}`;
}

function socialHandle(url: string, fallback: string): string {
  try {
    const handle = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (handle) return `@${handle.replace(/^@/, "")}`;
  } catch {
    return fallback;
  }
  return fallback;
}

function menuLabel(id: string, copy: (typeof UI)["en"] | (typeof UI)["es"], businessName: string): string {
  if (id === "services") return copy.services;
  if (id === "gallery") return copy.selectedWork;
  if (id === "about") return `${copy.about} ${aboutSubject(businessName)}`;
  if (id === "booking") return copy.bookAppointment;
  if (id === "contact") return copy.contact;
  if (id === "products") return copy.products;
  return copy.services;
}

export function MaisonSite(props: MaisonSiteProps) {
  const {
    businessName,
    businessType,
    headline,
    subheadline,
    aboutParagraphs,
    heroImage,
    heroVideo,
    galleryImages,
    galleryVideoUrl,
    galleryVideoTitle,
    address,
    phone,
    hours,
    bookingHours,
    showHours,
    socialLinks,
    colors,
    locale,
    onLocaleChange,
    services,
    bookingMode,
    showServices,
    showGallery,
    showAbout,
    aboutImage,
    showBooking,
    showContact,
    showMap,
    contactPreview,
    navItems,
    booking,
    products,
    proof,
    footerTagline,
  } = props;

  const copy = UI[locale];
  const palette = maisonPalette(colors);
  const { lead, tail } = splitBusinessName(businessName);
  const place = placeName(address);
  const headerLocation = address && address.trim().length <= 28 ? address.trim() : place;
  const specialty = TYPE_LABEL[locale][businessType] ?? "";
  const ribbon = [address?.trim(), specialty, tail || lead].filter(Boolean) as string[];
  const menuTitleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [headerSolid, setHeaderSolid] = useState(false);
  const paragraphs = aboutParagraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  const tel = phone ? phoneHref(phone, "tel") : null;
  const sms = phone ? phoneHref(phone, "sms") : null;
  const phoneLabel = phone ? formatPhoneDisplay(phone) : "";
  const displayHours = showHours ? resolveDisplayHours(bookingHours, hours) : null;
  const socials = [
    socialLinks?.tiktok ? { href: socialLinks.tiktok, label: socialHandle(socialLinks.tiktok, "TikTok") } : null,
    socialLinks?.instagram ? { href: socialLinks.instagram, label: socialHandle(socialLinks.instagram, "Instagram") } : null,
    socialLinks?.facebook ? { href: socialLinks.facebook, label: socialHandle(socialLinks.facebook, "Facebook") } : null,
  ].filter((item): item is { href: string; label: string } => !!item);

  let section = 1;
  const numberFor = (visible: boolean) => (visible ? String(section++).padStart(2, "0") : "");
  const servicesNo = numberFor(showServices && services.length > 0);
  const galleryNo = numberFor(showGallery && (!!galleryVideoUrl || galleryImages.length > 0));
  const aboutNo = numberFor(showAbout);
  const bookingNo = numberFor(showBooking);
  const contactNo = numberFor(showContact);

  const menuItems = navItems.filter((item) => item.id !== "hero");

  useEffect(() => {
    const onScroll = () => setHeaderSolid(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const scrollTo = (id: string) => {
    setOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const headerColor = headerSolid ? palette.ink : "#f7f4ee";
  const exploreTarget =
    showServices && services.length > 0 ? "services" : showGallery ? "gallery" : showAbout ? "about" : showBooking ? "booking" : "";

  return (
    <div
      data-template="maison"
      className={`${maisonSans.variable} ${maisonSerif.variable} relative min-h-screen overflow-x-hidden`}
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        fontFamily: "var(--font-maison-sans), Manrope, Arial, sans-serif",
      }}
    >
      <style>{`
        .maison-track { scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
        .maison-track::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .maison-track { scroll-behavior: auto; }
        }
      `}</style>

      <header
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-[22px] py-5 md:px-11"
        style={headerSolid ? { backgroundColor: `${palette.paper}f2`, backdropFilter: "blur(12px)" } : undefined}
      >
        <button
          type="button"
          className="pointer-events-auto grid h-9 w-9 place-content-center gap-[5px] border md:h-11 md:w-11"
          style={{ borderColor: headerSolid ? `${palette.ink}55` : "#ffffff65", color: headerColor }}
          aria-label={open ? copy.closeMenu : copy.openMenu}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="block h-px w-[17px]" style={{ backgroundColor: "currentColor" }} />
          <span className="block h-px w-[17px]" style={{ backgroundColor: "currentColor" }} />
        </button>
        <a
          href="#hero"
          className="pointer-events-auto absolute left-1/2 max-w-[42%] -translate-x-1/2 truncate text-center text-[17px] uppercase tracking-[0.22em] md:text-[22px] md:tracking-[0.18em]"
          style={{ ...SERIF, fontWeight: 500, color: headerColor }}
          onClick={(event) => {
            event.preventDefault();
            scrollTo("hero");
          }}
        >
          {lead}
        </a>
        {headerLocation ? (
          <a
            href={showContact ? "#contact" : "#hero"}
            className="pointer-events-auto max-w-[34%] truncate text-right text-[9px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: headerColor }}
            onClick={(event) => {
              if (!showContact) return;
              event.preventDefault();
              scrollTo("contact");
            }}
          >
            {headerLocation}
          </a>
        ) : (
          <span className="w-9" />
        )}
      </header>

      {open ? (
        <div className="fixed inset-0 z-[70] bg-[#101810]/60 px-4 pb-24 pt-16" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={menuTitleId}
            className="relative mx-auto mt-[4vh] w-full max-w-[24rem] px-8 pb-8 pt-12 shadow-[0_20px_100px_rgba(0,0,0,0.28)]"
            style={{ backgroundColor: palette.paper, color: palette.ink }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeRef}
              type="button"
              className="absolute right-4 top-3 px-2 text-2xl leading-none"
              aria-label={copy.closeMenu}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <p id={menuTitleId} className="text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: palette.gold }}>
              {businessName}
            </p>
            <nav className="mt-6 grid gap-3">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="text-left text-[1.7rem] leading-tight"
                  style={SERIF}
                  onClick={() => scrollTo(item.id)}
                >
                  {menuLabel(item.id, copy, businessName)}
                </button>
              ))}
            </nav>
            <div className="mt-6 flex gap-3 border-t pt-4 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: palette.line }}>
              <span className="opacity-50">{copy.language}</span>
              {(["en", "es"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  className="uppercase"
                  aria-pressed={locale === code}
                  style={{ color: locale === code ? palette.ink : palette.gold }}
                  onClick={() => onLocaleChange(code)}
                >
                  {code}
                </button>
              ))}
            </div>
            <a href="/admin" className="mt-4 block border-t pt-4 text-[13px]" style={{ borderColor: palette.line }}>
              {copy.ownerLogin} ↗
            </a>
          </div>
        </div>
      ) : null}

      <section id="hero" className="relative flex h-[86vh] min-h-[640px] max-h-[820px] items-end overflow-hidden text-white md:h-[800px] md:max-h-[900px]">
        {heroVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={heroImage}
            src={heroVideo}
          />
        ) : heroImage ? (
          <Image src={heroImage} alt="" fill priority className="object-cover" sizes="100vw" unoptimized />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: palette.band }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(17,23,14,0.44), rgba(17,23,14,0.02) 28%, rgba(20,24,16,0.14) 40%, rgba(17,23,14,0.78) 100%)",
          }}
        />
        <div className="relative z-[1] w-full px-5 pb-24 text-center md:pb-28">
          {headline ? (
            <p className="mb-5 text-[8px] font-semibold uppercase tracking-[0.24em] md:text-[10px] md:tracking-[0.28em]">
              {headline}
            </p>
          ) : null}
          <h1 className="text-[clamp(3.4rem,17vw,7.4rem)] leading-[0.86] tracking-[-0.03em]" style={SERIF}>
            {lead}
            {tail ? (
              <span className="mt-2 block text-[0.72em] italic tracking-[-0.02em]">{tail}</span>
            ) : null}
          </h1>
          {subheadline ? <p className="mx-auto mt-5 max-w-md text-[11px] tracking-wide text-[#f0ede6] md:text-xs">{subheadline}</p> : null}
          {exploreTarget ? (
            <a
              href={`#${exploreTarget}`}
              className="mx-auto mt-6 inline-flex min-h-12 min-w-[190px] items-center justify-between gap-6 bg-[#f6f3ec] px-6 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#292c27]"
              onClick={(event) => {
                event.preventDefault();
                scrollTo(exploreTarget);
              }}
            >
              {copy.findYourLook}
              <span aria-hidden>↗</span>
            </a>
          ) : null}
        </div>
        <div className="absolute inset-x-6 bottom-6 z-[1] flex items-center justify-between text-[7px] font-semibold uppercase tracking-[0.16em] md:inset-x-11 md:text-[8px] md:tracking-[0.2em]">
          <span>{specialty}</span>
          {exploreTarget ? (
            <a
              href={`#${exploreTarget}`}
              className="inline-flex items-center"
              onClick={(event) => {
                event.preventDefault();
                scrollTo(exploreTarget);
              }}
            >
              {copy.explore}
              <span className="ml-2.5 inline-block h-px w-11" style={{ backgroundColor: "#d6c49b" }} />
            </a>
          ) : null}
        </div>
      </section>

      {ribbon.length > 0 ? (
        <div
          className="border-b px-3 py-5 text-center text-[8px] font-semibold uppercase tracking-[0.12em] md:text-[9px] md:tracking-[0.18em]"
          style={{ borderColor: palette.line, color: palette.ink }}
        >
          {ribbon.map((item, index) => (
            <span key={item}>
              {index > 0 ? (
                <span className="mx-2 md:mx-4" style={{ color: palette.gold }} aria-hidden>
                  ✧
                </span>
              ) : null}
              <span className="opacity-70">{item}</span>
            </span>
          ))}
        </div>
      ) : null}

      {showServices ? (
        <MaisonServices
          services={services}
          galleryImages={galleryImages}
          intro={subheadline}
          palette={palette}
          bookingMode={bookingMode}
          showBooking={showBooking}
          copy={copy}
          indexLabel={servicesNo}
          serif={SERIF}
        />
      ) : null}

      {showGallery && (galleryVideoUrl || galleryImages.length > 0) ? (
        <section id="gallery" style={{ backgroundColor: `color-mix(in srgb, ${palette.ink} 6%, ${palette.paper})` }}>
          <div className="mx-auto max-w-[1180px] px-6 py-16 md:px-11 md:py-24">
            <div className="mb-8 md:mb-11">
              <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: palette.gold }}>
                {galleryNo} / {copy.selectedWork}
              </p>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <h2 className="text-[2.7rem] leading-none tracking-[-0.03em] md:text-[3.6rem]" style={SERIF}>
                  {copy.everyAngle}
                  <br />
                  <em className="italic">{copy.everyDetail}</em>
                </h2>
                <p className="max-w-[18rem] text-xs leading-relaxed opacity-70">{copy.galleryIntro}</p>
              </div>
            </div>
            {galleryVideoUrl ? (
              <figure className="mb-8">
                <video
                  className="aspect-[4/5] w-full object-cover md:aspect-video"
                  src={galleryVideoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label={galleryVideoTitle || copy.inMotion}
                />
                <figcaption className="mt-3 flex justify-between text-[8px] font-semibold uppercase tracking-[0.16em] opacity-60">
                  <span>{copy.watch}</span>
                  <span>{galleryVideoTitle || copy.inMotion}</span>
                </figcaption>
              </figure>
            ) : null}
            {galleryImages.length > 0 ? (
              <div className="grid grid-cols-2 items-start gap-3.5 md:grid-cols-[1.2fr_0.8fr_1fr] md:gap-5">
                {galleryImages.slice(0, 3).map((src, index) => (
                  <figure
                    key={src}
                    className={
                      index === 1
                        ? "pt-10 md:pt-20"
                        : index === 2
                          ? "col-span-2 md:col-span-1 md:pt-6"
                          : ""
                    }
                  >
                    <div
                      className={`relative overflow-hidden ${
                        index === 0 ? "h-64 md:h-[440px]" : index === 1 ? "h-52 md:h-[330px]" : "h-72 md:h-[390px]"
                      }`}
                    >
                      <Image src={src} alt={`${businessName} ${index + 1}`} fill className="object-cover" sizes="(max-width: 767px) 50vw, 33vw" unoptimized />
                    </div>
                    <figcaption className="mt-2.5 flex justify-between text-[8px] font-semibold uppercase tracking-[0.14em] opacity-60">
                      <span>{copy.look}</span>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            {galleryImages.length > 3 ? (
              <div className="mt-6 grid grid-cols-2 gap-3.5 md:grid-cols-3 md:gap-5">
                {galleryImages.slice(3).map((src, index) => (
                  <figure key={src}>
                    <div className="relative h-52 overflow-hidden md:h-72">
                      <Image
                        src={src}
                        alt={`${businessName} ${index + 4}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 767px) 50vw, 33vw"
                        unoptimized
                      />
                    </div>
                    <figcaption className="mt-2.5 flex justify-between text-[8px] font-semibold uppercase tracking-[0.14em] opacity-60">
                      <span>{copy.look}</span>
                      <span>{String(index + 4).padStart(2, "0")}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            {(subheadline || socials.length > 0) && (
              <div className="mt-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                {subheadline ? (
                  <p className="max-w-[16rem] text-[1.4rem] italic leading-snug md:text-[1.7rem]" style={SERIF}>
                    {subheadline}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-col gap-2">
                  {socials.map((social) => (
                    <a
                      key={social.href}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border-b pb-1 text-[9px] font-semibold uppercase tracking-[0.16em]"
                      style={{ borderColor: palette.gold }}
                    >
                      {social.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {showAbout ? (
        <section id="about" className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 py-16 md:grid-cols-2 md:gap-24 md:px-11 md:py-24">
          {aboutImage ? (
            <div className="relative isolate pr-4 pb-4 md:pr-6 md:pb-6">
              <div className="relative h-[395px] md:h-[610px]">
                <Image src={aboutImage} alt="" fill className="object-cover" sizes="(max-width: 767px) 100vw, 50vw" unoptimized />
              </div>
              <span className="absolute bottom-0 left-4 right-0 top-4 -z-10 border md:left-6 md:top-6" style={{ borderColor: palette.gold }} />
            </div>
          ) : null}
          <div>
            <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: palette.gold }}>
              {aboutNo} / {copy.behind}
            </p>
            <h2 className="mb-6 max-w-[16rem] text-[2.6rem] leading-none tracking-[-0.03em] md:text-[3.4rem]" style={SERIF}>
              {copy.about} <em className="italic">{aboutSubject(businessName)}</em>
            </h2>
            <div className="max-w-[24rem] space-y-4 text-[13px] leading-loose opacity-75">
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <p className="mt-6 text-[2rem] italic" style={SERIF}>
              {signatureLine(businessName)}
            </p>
            <div
              className="mt-6 flex justify-between gap-4 border-t pt-4 text-[8px] font-semibold uppercase tracking-[0.14em] opacity-70"
              style={{ borderColor: palette.line }}
            >
              <span>{address}</span>
              <span>{specialty}</span>
            </div>
          </div>
        </section>
      ) : null}

      {products}
      {proof}

      {showBooking ? (
        <section className="px-6 py-16 text-center md:py-24" style={{ backgroundColor: palette.band, color: palette.bandText }}>
          <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: palette.goldOnBand }}>
            {bookingNo} / {copy.bookingEyebrow}
          </p>
          <h2 className="mx-auto max-w-[18rem] text-[3.2rem] leading-[1.04] tracking-[-0.03em] md:max-w-3xl md:text-[4.5rem]" style={SERIF}>
            {copy.bookingTitle}
            <br />
            <em className="italic">{copy.bookingTitleEm}</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xs text-xs leading-relaxed opacity-80 md:max-w-md">
            {copy.bookingLead} {businessName}.
          </p>
          <a
            href="#booking"
            className="mx-auto mt-7 inline-flex min-h-12 w-[235px] items-center justify-between bg-[#f6f3ec] px-6 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#292c27]"
          >
            {copy.bookCta}
            <span aria-hidden>↗</span>
          </a>
        </section>
      ) : null}
      {booking}

      {showContact ? (
        <section id="contact" className="mx-auto max-w-[1180px] px-6 py-12 md:px-11 md:py-16">
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: palette.gold }}>
            {contactNo} / {copy.contact}
          </p>
          <h2 className="mt-3 text-[2.4rem] leading-none md:text-[2.8rem]" style={SERIF}>
            {place ? (
              <>
                {copy.seeYouIn} <em className="italic">{place}.</em>
              </>
            ) : (
              copy.seeYou
            )}
          </h2>
          <div className="mt-8 flex flex-wrap gap-10">
            {address ? (
              <div>
                <p className="mb-2 text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.gold }}>
                  {copy.theLocation}
                </p>
                <p className="whitespace-pre-line text-[11px] leading-relaxed">{address}</p>
              </div>
            ) : null}
            {(phone || socials.length > 0) && (
              <div>
                <p className="mb-2 text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.gold }}>
                  {copy.getInTouch}
                </p>
                <p className="text-[11px] leading-relaxed">
                  {sms ? (
                    <a href={sms} className="border-b" style={{ borderColor: palette.line }}>
                      {copy.text} {phoneLabel}
                    </a>
                  ) : null}
                  {tel ? (
                    <>
                      <br />
                      <a href={tel} className="border-b" style={{ borderColor: palette.line }}>
                        {phoneLabel}
                      </a>
                    </>
                  ) : null}
                  {socials.map((social) => (
                    <span key={social.href}>
                      <br />
                      <a href={social.href} target="_blank" rel="noopener noreferrer" className="border-b" style={{ borderColor: palette.line }}>
                        {social.label} ↗
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
      {showContact ? (
        <TemplateContact
          colors={colors}
          previewMode={contactPreview}
          title={copy.getInTouch}
          subtitle={subheadline || copy.seeYou}
        />
      ) : null}
      {showMap ? <TemplateMap address={address} colors={colors} /> : null}

      <footer
        className={`mx-auto flex max-w-[1180px] flex-col gap-4 px-6 pt-6 text-[11px] md:flex-row md:items-end md:justify-between md:px-11 ${
          showBooking ? "pb-28 md:pb-8" : "pb-8"
        }`}
        style={{ color: palette.ink }}
      >
        <div className="max-w-xl space-y-2 opacity-70">
          <p>
            © {new Date().getFullYear()} {businessName}
            {" · "}
            {copy.poweredBy}{" "}
            <a href="https://siteforowners.com" className="underline" target="_blank" rel="noopener noreferrer">
              SiteForOwners
            </a>
          </p>
          {footerTagline ? <p>{footerTagline}</p> : null}
          {address ? <p>{address}</p> : null}
          {tel ? <p><a href={tel}>{phoneLabel}</a></p> : null}
        </div>
        {displayHours ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] uppercase tracking-[0.08em] opacity-70">
            <p className="col-span-2 text-[8px] font-semibold tracking-[0.18em]" style={{ color: palette.gold }}>
              {copy.hours}
            </p>
            {DAY_ORDER.map((day) => {
              const value = displayHours[day];
              if (!value) return null;
              return (
                <p key={day} className="flex justify-between gap-3">
                  <span>{day.slice(0, 3)}</span>
                  <span>{value.closed ? copy.closed : `${value.open}–${value.close}`}</span>
                </p>
              );
            })}
          </div>
        ) : null}
      </footer>

      {showBooking ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t px-[22px] py-3 md:hidden"
          style={{
            backgroundColor: `${palette.paper}f5`,
            borderColor: palette.line,
            backdropFilter: "blur(12px)",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <div>
            <p className="max-w-[12rem] truncate text-xl leading-none" style={SERIF}>
              {tail ? `${lead} ${tail}` : lead}
            </p>
            {headerLocation ? (
              <p className="mt-1 text-[7px] font-semibold uppercase tracking-[0.14em] opacity-60">{headerLocation}</p>
            ) : null}
          </div>
          <a
            href="#booking"
            className="inline-flex min-h-10 items-center gap-4 px-4 text-[8px] font-semibold uppercase tracking-[0.16em]"
            style={{ backgroundColor: palette.ink, color: palette.paper }}
          >
            {copy.bookNow}
            <span aria-hidden>↗</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
