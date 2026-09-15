"use client";

import { useTranslations } from "next-intl";
import type { InvitationStyleGuide as InvitationStyleGuideValue } from "@/lib/invitations/style-guide";

export function InvitationStyleGuide({ guide, titleClass, accent, surface }: {
  guide: InvitationStyleGuideValue;
  titleClass: string;
  accent: string;
  surface: string;
}) {
  const t = useTranslations("invitations.public.styleGuide");
  return (
    <section className="px-5 py-8 sm:px-9" style={{ border: `1px solid ${accent}`, backgroundColor: surface }} aria-labelledby="invitation-style-guide-heading">
      <h2 id="invitation-style-guide-heading" className={`${titleClass} text-3xl sm:text-4xl`}>{t("title")}</h2>
      {guide.note && <p className="mt-4 text-lg leading-8">{guide.note}</p>}
      {guide.colors.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{t("colors")}</h3>
          <ul className="mt-3 flex flex-wrap gap-4">
            {guide.colors.map((item) => <li key={`${item.name}:${item.color}`} className="flex items-center gap-2.5">
              <span aria-label={`${item.name}: ${item.color}`} role="img" className="size-9 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: item.color }} />
              <span className="font-medium">{item.name}</span>
            </li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
