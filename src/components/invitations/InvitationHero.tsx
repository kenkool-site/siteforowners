"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { eventDisplayClass } from "./event-display";

function HonoreeTitle({ name }: { name: string }) {
  const pieces = name.split(/(\s*&\s*)/);
  return (
    <>
      {pieces.map((piece, index) => piece.trim() === "&" || piece.includes("&")
        ? <span key={index} className={`${eventDisplayClass} italic font-medium`}>{piece}</span>
        : <span key={index}>{piece}</span>)}
    </>
  );
}

export function InvitationHero({
  coverUrl,
  coverAlt,
  honoreeNames,
  whenLabel,
  venueLine,
  eyebrow,
  supportingTitle,
  phase = "upcoming",
  thanksTitle,
  thanksBody,
  thanksAction,
  memoriesHref,
}: {
  coverUrl: string | null;
  coverAlt: string;
  honoreeNames: string;
  whenLabel: string | null;
  venueLine: string | null;
  eyebrow: string;
  supportingTitle?: string;
  phase?: "upcoming" | "thanks";
  thanksTitle?: string;
  thanksBody?: string;
  thanksAction?: string;
  memoriesHref?: string;
}) {
  const t = useTranslations("invitations.public");

  useEffect(() => {
    if (window.location.hash === "#invitation-content") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    window.scrollTo(0, 0);
  }, []);

  function viewInvitation() {
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("invitation-content")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  const optimizedCover = coverUrl?.startsWith("/api/invitations/public/") ?? false;

  return (
    <section
      id="invitation-hero"
      data-invitation-hero={coverUrl ? "cover" : "palette"}
      data-invitation-phase={phase}
      className="relative flex min-h-[100dvh] flex-col justify-end bg-[#14261A] text-white"
    >
      {coverUrl && (
        optimizedCover ? (
          <Image
            src={coverUrl}
            alt={coverAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_20%]"
          />
        ) : (
          // Signed cover URLs change on every fetch, so next/image cannot cache them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={coverAlt} decoding="async" className="absolute inset-0 h-full w-full object-cover object-[center_20%]" />
        )
      )}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ background: "linear-gradient(180deg, rgba(10,16,12,.35) 0%, rgba(10,16,12,.12) 38%, rgba(10,16,12,.55) 72%, rgba(10,16,12,.82) 100%)" }}
      />
      <div data-invitation-frame="gold" className="pointer-events-none absolute inset-3.5 z-[1] border border-[#D4C2A0]/45 sm:inset-5" />
      <div className="relative z-10 mx-auto w-full max-w-lg px-7 pb-16 pt-24 text-center sm:pb-20" style={{ textShadow: "0 1px 16px rgba(0,0,0,.45)" }}>
        {phase === "thanks" ? (
          <>
            {whenLabel && <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#D4C2A0]">{whenLabel}</p>}
            <h1 className={`${eventDisplayClass} mt-2 text-[clamp(2.6rem,10vw,3.4rem)] font-medium leading-[1.05]`}>{thanksTitle}</h1>
            {thanksBody && <p className="mt-3 text-sm text-white/90">{thanksBody}</p>}
            {memoriesHref && thanksAction && (
              <a href={memoriesHref} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[#1A3D24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#14261A]">
                {thanksAction}
                <span aria-hidden="true">→</span>
              </a>
            )}
          </>
        ) : (
          <>
            <p data-invitation-kicker="true" className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[#D4C2A0]">{eyebrow}</p>
            <h1 className={`${eventDisplayClass} text-[clamp(3.2rem,12vw,4.6rem)] font-medium leading-[0.95] tracking-[-0.02em]`}>
              <HonoreeTitle name={honoreeNames} />
            </h1>
            {supportingTitle && <p data-invitation-supporting="true" className="mt-3 text-sm tracking-wide text-white/85">{supportingTitle}</p>}
            {whenLabel && <p className="mt-3.5 text-[13.5px] tracking-[0.04em] text-white/95">{whenLabel}</p>}
            {venueLine && <p data-invitation-venue="true" className="mt-1.5 text-[13px] text-[#D4C2A0]">{venueLine}</p>}
            <button type="button" onClick={viewInvitation} className="mt-6 inline-flex flex-col items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t("scrollCue")}
              <span aria-hidden="true" className="relative h-6 w-4 rounded-full border border-white/50">
                <span className="absolute left-1/2 top-1.5 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-white motion-safe:animate-bounce motion-reduce:animate-none" />
              </span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
