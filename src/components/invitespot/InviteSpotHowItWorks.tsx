"use client";

import { useTranslations } from "next-intl";

export function InviteSpotHowItWorks() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C6B6F]">{t("howItWorks.heading")}</p>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        {(["step1", "step2", "step3"] as const).map((key, index) => (
          <div key={key}>
            <div className="flex size-8 items-center justify-center rounded-full bg-[#6B2F3A] text-sm font-semibold text-[#FBF3F0]">{index + 1}</div>
            <h3 className="mt-3 font-semibold text-[#2E1A1E]">{t(`howItWorks.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-[#5b5147]">{t(`howItWorks.${key}.body`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
