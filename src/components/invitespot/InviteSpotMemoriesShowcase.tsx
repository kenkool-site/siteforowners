"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function InviteSpotMemoriesShowcase() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className="grid items-center gap-8 sm:grid-cols-2">
        <div className="sm:order-1">
          <h2 className="font-serif text-2xl font-bold text-[#2E1A1E] sm:text-3xl">{t("memories.heading")}</h2>
          <p className="mt-3 text-base text-[#5b4f3f]">{t("memories.body")}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-[#5b4f3f]">
            {(["bullet1", "bullet2", "bullet3"] as const).map((key) => (
              <li key={key} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-[#C98A8F]">♥</span>
                <span>{t(`memories.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F6E8E2] sm:order-2">
          <Image
            src="/invitespot/memories-showcase.jpg"
            alt={t("memories.imageAlt")}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
