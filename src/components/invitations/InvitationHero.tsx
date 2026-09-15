"use client";

import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InvitationDesignRecipe } from "@/lib/invitations/design-recipe";

export function InvitationHero({ coverUrl, title, honoreeNames, date, recipe }: {
  coverUrl: string | null;
  title: string;
  honoreeNames: string;
  date: string;
  recipe: InvitationDesignRecipe;
}) {
  const t = useTranslations("invitations.public");
  const placement = recipe.composition.heroTextPlacement === "top" ? "justify-start pt-24" : recipe.composition.heroTextPlacement === "bottom" ? "justify-end pb-24" : "justify-center";
  const style = {
    minHeight: `${recipe.hero.minHeightVh}dvh`,
    backgroundColor: recipe.palette.overlay,
    backgroundImage: coverUrl ? `url("${coverUrl.replaceAll('"', "%22")}")` : undefined,
    backgroundPosition: `${recipe.hero.focalX * 100}% ${recipe.hero.focalY * 100}%`,
  } as CSSProperties;
  return (
    <section data-invitation-hero={coverUrl ? "cover" : "palette"} className={`relative flex bg-cover bg-no-repeat px-6 text-center ${placement}`} style={style}>
      <div className="absolute inset-0" aria-hidden="true" style={{ backgroundColor: recipe.palette.overlay, opacity: coverUrl ? recipe.hero.overlayStrength : 0 }} />
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center" style={{ color: recipe.hero.textColor }}>
        <p className="text-[clamp(1rem,2.5vw,1.35rem)] font-medium tracking-[0.08em]">{date}</p>
        <h1 className="mt-5 font-[family-name:var(--font-fraunces)] text-[clamp(3.4rem,12vw,8rem)] leading-[0.88] tracking-[-0.04em]">{title}</h1>
        {honoreeNames && honoreeNames !== title && <p className="mt-6 text-xl sm:text-2xl">{honoreeNames}</p>}
        <a href="#invitation-content" className="mt-12 inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2">
          {t("viewInvitation")}<ChevronDown className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
