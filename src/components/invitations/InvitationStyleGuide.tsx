"use client";

import { useTranslations } from "next-intl";
import type { InvitationStyleGuide as InvitationStyleGuideValue } from "@/lib/invitations/style-guide";
import { eventDisplayClass } from "./event-display";

export function InvitationStyleGuide({ guide, titleClass }: {
  guide: InvitationStyleGuideValue;
  titleClass: string;
  accent?: string;
  surface?: string;
}) {
  const t = useTranslations("invitations.public.styleGuide");
  return (
    <section id="invitation-dress" className="px-6 py-9 text-center" aria-labelledby="invitation-style-guide-heading">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#B3945C]">{t("title")}</p>
      <h2 id="invitation-style-guide-heading" className={`${titleClass || eventDisplayClass} mt-2 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("wear")}</h2>
      {guide.note && <p className={`${eventDisplayClass} mt-3 text-[1.35rem] italic leading-snug text-[#14261A]`}>{guide.note}</p>}
      {guide.colors.length > 0 && (
        <div className="mt-5">
          <div aria-hidden="true" className="mx-auto h-px w-10 bg-[#B3945C]" />
          <h3 className="mt-3.5 text-xs text-[#5E6F61]">{t("colors")}</h3>
          <ul className="mt-4 flex flex-wrap justify-center gap-4">
            {guide.colors.map((item) => (
              <li key={`${item.name}:${item.color}`} className="w-16 text-center">
                <span aria-label={`${item.name}: ${item.color}`} role="img" className="mx-auto block size-[54px] rounded-full shadow-[inset_0_0_0_1px_rgba(20,38,26,.12)]" style={{ backgroundColor: item.color }} />
                <span className="mt-2 block text-xs font-medium text-[#14261A]">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
