"use client";

import { useEffect, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { neutralOverlayColor, type InvitationDesignRecipe } from "@/lib/invitations/design-recipe";
import { InvitationFrame } from "./InvitationFrame";

function comparableHeading(value: string): string {
  return value.toLocaleLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]+/g, " ").trim();
}

export function InvitationHero({ coverUrl, title, honoreeNames, date, venueName, recipe }: {
  coverUrl: string | null;
  title: string;
  honoreeNames: string;
  date: string;
  venueName: string | null;
  recipe: InvitationDesignRecipe;
}) {
  const t = useTranslations("invitations.public");

  useEffect(() => {
    if (window.location.hash === "#invitation-content") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    window.scrollTo(0, 0);
  }, []);

  function viewInvitation() {
    document.getElementById("invitation-content")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const placement = recipe.composition.heroTextPlacement === "top" ? "justify-start pt-24" : recipe.composition.heroTextPlacement === "bottom" ? "justify-end pb-56" : "justify-center pb-48 pt-16";
  const alignment = recipe.composition.alignment === "left" ? "items-start text-left" : "items-center text-center";
  const displayStyle = recipe.typography.display === "formal-script" ? "italic" : "normal";
  const motif = ({ botanical: "❦", floral: "✿", geometric: "◆", ribbon: "〰", ornamental: "✦" } as const)[recipe.decoration.motif as Exclude<typeof recipe.decoration.motif, "none">] ?? "";
  const mainTitle = honoreeNames.trim() || title;
  const supportingTitle = comparableHeading(title) !== comparableHeading(mainTitle) ? title : "";
  const overlayColor = coverUrl ? neutralOverlayColor(recipe.palette.overlay) : recipe.palette.overlay;
  const style = {
    minHeight: `${recipe.hero.minHeightVh}dvh`,
    backgroundColor: recipe.palette.overlay,
    backgroundImage: coverUrl ? `url("${coverUrl.replaceAll('"', "%22")}")` : undefined,
    backgroundPosition: `${recipe.hero.focalX * 100}% ${recipe.hero.focalY * 100}%`,
  } as CSSProperties;
  return (
    <section data-invitation-hero={coverUrl ? "cover" : "palette"} className={`relative flex flex-col bg-cover bg-no-repeat px-6 ${placement}`} style={style}>
      <div className="absolute inset-0" aria-hidden="true" style={{ backgroundColor: overlayColor, opacity: coverUrl ? recipe.hero.overlayStrength : 0 }} />
      <InvitationFrame style={recipe.frame.style} color={recipe.palette.accent} width={recipe.frame.width} radius={recipe.frame.radius} />
      <div className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col ${alignment}`} style={{ color: recipe.hero.textColor }}>
        {motif && <div aria-hidden="true" className="mb-6 text-3xl" style={{ color: recipe.palette.accent }}>{motif}</div>}
        {supportingTitle && <p data-invitation-kicker="true" className="mb-4 text-base font-medium tracking-[0.12em] sm:text-xl">{supportingTitle}</p>}
        <h1 className="font-[family-name:var(--font-fraunces)] text-[clamp(3.4rem,12vw,8rem)] leading-[0.88]" style={{ fontStyle: displayStyle, fontWeight: recipe.typography.weight, letterSpacing: `${recipe.typography.tracking}em` }}>{mainTitle}</h1>
      </div>
      <div className="absolute inset-x-8 bottom-24 z-20 flex flex-col items-center text-center" style={{ color: recipe.hero.textColor }}>
        <p className="text-[clamp(1rem,2.5vw,1.35rem)] font-medium tracking-[0.04em]">{date}</p>
        {venueName && <p data-invitation-venue="true" className="mt-2 text-sm font-medium tracking-[0.04em] opacity-90 sm:text-base">{venueName}</p>}
        <button type="button" onClick={viewInvitation} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2">
          {t("viewInvitation")}<ChevronDown className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
